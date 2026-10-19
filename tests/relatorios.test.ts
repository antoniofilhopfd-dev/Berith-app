import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { inflateRawSync } from "node:zlib";
import { execute, closePool } from "@/lib/db";
import { ForbiddenError } from "@/lib/permissions";
import { DomainError } from "@/lib/services/errors";
import { gerarRelatorio, textoCelula, validarPeriodo, variacao } from "@/lib/services/relatorios";
import { gerarXlsx } from "@/lib/export/xlsx";
import { gerarPdf } from "@/lib/export/pdf";
import { paraPdf, paraPlanilhas } from "@/lib/export/relatorio";
import * as P from "@/lib/services/publicacoes";
import { criarMidia, equipePadrao, pubBase, resetTestDb } from "./helpers";

let e: Awaited<ReturnType<typeof equipePadrao>>;
const X = { prazo: null, publicarEm: null };

async function publicada(rede: "instagram" | "facebook" | "youtube", quando: string, metricas: Record<string, number> | null, assistida = 0, formato: "post" | "video" = "post") {
  const m = await criarMidia(e.integ, formato === "video" ? "video" : "imagem");
  const id = await P.criar(e.integ, pubBase({ titulo: `Pub ${rede} ${quando}`, redes: [rede], formato, midiaIds: [m] }), X);
  await execute("UPDATE publicacoes SET status = 'publicado' WHERE id = ?", [id]);
  const rid = (await (await import("@/lib/db")).query<any>("SELECT id FROM publicacao_redes WHERE publicacao_id = ?", [id]))[0].id;
  await execute("UPDATE publicacao_redes SET envio = 'publicada', publicada_em = ?, assistida = ?, post_externo_id = 'ext' WHERE id = ?", [new Date(quando), assistida, rid]);
  if (metricas) {
    const c = ["alcance", "impressoes", "curtidas", "comentarios", "compartilhamentos", "salvamentos", "visualizacoes"];
    await execute(`INSERT INTO metricas_publicacao (publicacao_rede_id, coletado_em, ${Object.keys(metricas).join(",")}) VALUES (?, ?, ${Object.keys(metricas).map(() => "?").join(",")})`, [rid, new Date(new Date(quando).getTime() + 3600_000), ...Object.values(metricas)]);
    void c;
  }
  return rid;
}

beforeAll(async () => {
  await resetTestDb(); e = await equipePadrao();
  // período atual: 10 a 19/10 (UTC-3, meio-dia local = 15:00Z); anterior: 30/09 a 09/10
  const r1 = await publicada("instagram", "2026-10-12T15:00:00Z", { alcance: 1000, curtidas: 80, comentarios: 10, compartilhamentos: 5, salvamentos: 15, visualizacoes: 1500 });
  await execute("INSERT INTO metricas_publicacao (publicacao_rede_id, coletado_em, alcance, curtidas) VALUES (?, ?, 1200, 90)", [r1, new Date("2026-10-14T15:00:00Z")]); // coleta mais recente prevalece
  await publicada("instagram", "2026-10-15T15:00:00Z", { alcance: 500, curtidas: 20, comentarios: 2, compartilhamentos: 1, salvamentos: 3, visualizacoes: 700 });
  await publicada("instagram", "2026-10-05T15:00:00Z", { alcance: 400, curtidas: 40 }); // período anterior
  await publicada("facebook", "2026-10-16T15:00:00Z", null, 1); // assistida: sem métricas
  await publicada("youtube", "2026-10-17T15:00:00Z", { visualizacoes: 300, curtidas: 30, comentarios: 3 }, 0, "video");
});
afterAll(closePool);

describe("relatório orgânico", () => {
  it("valida o período", () => {
    expect(() => validarPeriodo("2026-10-20", "2026-10-01")).toThrow(DomainError);
    expect(() => validarPeriodo("2026-02-30", "2026-03-01")).toThrow(DomainError);
    expect(() => validarPeriodo("2024-01-01", "2026-10-01")).toThrow(/400 dias/);
  });
  it("só quem tem permissão vê", async () => {
    await expect(gerarRelatorio(e.integ, "2026-10-10", "2026-10-19")).rejects.toBeInstanceOf(ForbiddenError);
    await expect(gerarRelatorio(e.aprov, "2026-10-10", "2026-10-19")).rejects.toBeInstanceOf(ForbiddenError);
    await gerarRelatorio(e.coord, "2026-10-10", "2026-10-19");
  });
  it("soma a coleta MAIS RECENTE de cada publicação e conta as publicações do período", async () => {
    const r = await gerarRelatorio(e.coord, "2026-10-10", "2026-10-19");
    const ig = r.redes.find((x) => x.rede === "instagram")!;
    expect(ig.publicadas).toBe(2);
    expect(ig.metricas.alcance).toEqual({ estado: "valor", valor: 1200 + 500 }); // 1200 (coleta nova) + 500
    expect(ig.metricas.curtidas).toEqual({ estado: "valor", valor: 90 + 20 });
    expect(ig.metricas.visualizacoes).toEqual({ estado: "valor", valor: 700 }); // a coleta nova da 1ª não trouxe visualizações → NULL não vira zero
    expect(r.totais).toMatchObject({ publicadas: 4, automaticas: 3, assistidas: 1, anterior: 1 });
  });
  it("diferencia indisponível, não conectada e sem dados (nunca inventa zero)", async () => {
    const r = await gerarRelatorio(e.coord, "2026-10-10", "2026-10-19");
    const fb = r.redes.find((x) => x.rede === "facebook")!, tt = r.redes.find((x) => x.rede === "tiktok")!, yt = r.redes.find((x) => x.rede === "youtube")!, ig = r.redes.find((x) => x.rede === "instagram")!;
    expect(ig.metricas.impressoes).toEqual({ estado: "indisponivel" }); // a API do Instagram não fornece impressões
    expect(yt.metricas.alcance).toEqual({ estado: "indisponivel" }); expect(yt.metricas.salvamentos).toEqual({ estado: "indisponivel" });
    expect(yt.metricas.visualizacoes).toEqual({ estado: "valor", valor: 300 });
    expect(fb.publicadas).toBe(1); expect(fb.assistidas).toBe(1); expect(fb.metricas.curtidas).toEqual({ estado: "nao_conectada" }); // assistida, sem conta
    expect(tt.publicadas).toBe(0); expect(tt.metricas.visualizacoes).toEqual({ estado: "nao_conectada" });
    await execute("INSERT INTO redes_contas (rede, status, token_enc) VALUES ('tiktok', 'conectada', 'x')");
    const r2 = await gerarRelatorio(e.coord, "2026-10-10", "2026-10-19");
    expect(r2.redes.find((x) => x.rede === "tiktok")!.metricas.visualizacoes).toEqual({ estado: "sem_dados" }); // conectada, ainda sem coleta
    expect(textoCelula({ estado: "valor", valor: 1234567 })).toBe("1.234.567");
  });
  it("compara com o período anterior de mesma duração", async () => {
    const r = await gerarRelatorio(e.coord, "2026-10-10", "2026-10-19");
    expect([r.anteriorDe, r.anteriorAte]).toEqual(["2026-09-30", "2026-10-09"]);
    const ig = r.redes.find((x) => x.rede === "instagram")!;
    expect(ig.publicadasAnterior).toBe(1); expect(ig.anterior!.alcance).toEqual({ estado: "valor", valor: 400 });
    expect(variacao(ig.metricas.alcance, ig.anterior!.alcance)).toBe(325); // (1700-400)/400
    expect(variacao({ estado: "valor", valor: 5 }, { estado: "valor", valor: 0 })).toBeNull(); // sem divisão por zero
    expect(variacao({ estado: "sem_dados" }, { estado: "valor", valor: 5 })).toBeNull();
    expect((await gerarRelatorio(e.coord, "2026-10-10", "2026-10-19", false)).anteriorDe).toBeNull();
  });
  it("seguidores: variação entre o primeiro e o último dia com dado", async () => {
    await execute("INSERT INTO metricas_conta (rede, dia, seguidores) VALUES ('instagram','2026-10-10',1000),('instagram','2026-10-18',1060),('instagram','2026-09-01',5)");
    const r = await gerarRelatorio(e.coord, "2026-10-10", "2026-10-19");
    expect(r.redes.find((x) => x.rede === "instagram")!.seguidores).toEqual({ inicio: 1000, fim: 1060, variacao: 60 });
    expect(r.redes.find((x) => x.rede === "youtube")!.seguidores).toEqual({ inicio: null, fim: null, variacao: null });
  });
  it("lista as publicações do período com a origem (automática/assistida)", async () => {
    const r = await gerarRelatorio(e.coord, "2026-10-10", "2026-10-19");
    expect(r.publicacoes).toHaveLength(4);
    expect(r.publicacoes.find((p) => p.rede === "facebook")).toMatchObject({ assistida: true, coletada: false });
    expect(r.formatos).toEqual(expect.arrayContaining([{ formato: "post", publicadas: 3 }, { formato: "video", publicadas: 1 }]));
  });
});

describe("exportação", () => {
  const lerZip = (b: Buffer) => { // extrai os arquivos de um zip (store/deflate) para inspeção
    const out: Record<string, string> = {}; let i = 0;
    while (b.readUInt32LE(i) === 0x04034b50) {
      const met = b.readUInt16LE(i + 8), cs = b.readUInt32LE(i + 18), n = b.readUInt16LE(i + 26), x = b.readUInt16LE(i + 28);
      const nome = b.subarray(i + 30, i + 30 + n).toString(), dados = b.subarray(i + 30 + n + x, i + 30 + n + x + cs);
      out[nome] = (met === 8 ? inflateRawSync(dados) : dados).toString("utf8"); i += 30 + n + x + cs;
    }
    return out;
  };
  it("Excel: zip válido, textos nunca viram fórmula e XML é escapado", () => {
    const z = lerZip(gerarXlsx([{ nome: "Teste/Inválido:*", linhas: [["Cab", "N"], ["=HYPERLINK(\"http://evil\",\"x\")", 5], ["+cmd|' /C calc'!A0", null], ["<b>&\"'", 1.5]] }]));
    expect(Object.keys(z)).toEqual(expect.arrayContaining(["[Content_Types].xml", "xl/workbook.xml", "xl/worksheets/sheet1.xml", "xl/styles.xml"]));
    const sheet = z["xl/worksheets/sheet1.xml"];
    expect(sheet).not.toMatch(/<f[ >]/); // nenhuma fórmula
    expect(sheet).toContain('t="inlineStr"'); expect(sheet).toContain("&lt;b&gt;&amp;&quot;&apos;"); expect(sheet).toContain("<v>5</v>");
    expect(z["xl/workbook.xml"]).toContain('name="Teste Inválido  "'.trim().slice(0, 0) + "Teste"); // nome da aba sem \\ / ? * [ ] :
    expect(z["xl/workbook.xml"]).not.toMatch(/name="[^"]*[:*\/?]/);
  });
  it("Excel e PDF do relatório: conteúdo coerente com os números", async () => {
    const r = await gerarRelatorio(e.coord, "2026-10-10", "2026-10-19");
    const z = lerZip(gerarXlsx(paraPlanilhas(r)));
    expect(z["xl/workbook.xml"]).toMatch(/Resumo.*Publicações.*Comparação.*Formatos/s);
    expect(z["xl/worksheets/sheet1.xml"]).toContain("<v>1700</v>"); expect(z["xl/worksheets/sheet1.xml"]).toContain("indisponível");
    const pdf = Buffer.from(await gerarPdf(paraPdf(r, "Ministério — teste ✝ “aspas”")));
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-"); expect(pdf.length).toBeGreaterThan(1500); expect(pdf.subarray(-6).toString()).toContain("%%EOF");
  });
  it("PDF aguenta caracteres fora do Latin-1, textos longos e muitas linhas (paginação)", async () => {
    const linhas = Array.from({ length: 150 }, (_, i) => [`Linha ${i} ✝️ 😀 ${"x".repeat(200)}`, "1"]);
    const pdf = await gerarPdf({ titulo: "T 😀", subtitulo: "S", tabelas: [{ titulo: "Grande", colunas: [{ rotulo: "A", largura: 100 }, { rotulo: "B", largura: 20, alinhar: "dir" }], linhas }] });
    const { PDFDocument } = await import("pdf-lib");
    expect((await PDFDocument.load(pdf)).getPageCount()).toBeGreaterThan(3); // várias páginas
  });
});
