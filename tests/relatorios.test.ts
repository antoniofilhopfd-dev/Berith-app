import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execute, closePool } from "@/lib/db";
import { ForbiddenError } from "@/lib/permissions";
import { DomainError } from "@/lib/services/errors";
import { gerarRelatorioMensal, melhoresHorarios, mesAnterior, rotuloMes, validarMes, variacaoPct, interacoesDe } from "@/lib/services/relatorios";
import { gerarXlsx } from "@/lib/export/xlsx";
import { gerarPdf } from "@/lib/export/pdf";
import { paraPdf, paraPlanilhas } from "@/lib/export/relatorio";
import { cifrar } from "@/lib/integracoes/cripto";
import { equipePadrao, resetTestDb } from "./helpers";

let e: Awaited<ReturnType<typeof equipePadrao>>;

async function post(conta: string, id: string, quando: string, m: Partial<Record<"curtidas" | "comentarios" | "salvamentos" | "compartilhamentos" | "alcance" | "visualizacoes", number>> = {}, tipo = "IMAGE") {
  await execute("INSERT INTO posts_externos (rede, conta_id, id_externo, tipo, legenda, url, publicado_em, alcance, curtidas, comentarios, compartilhamentos, salvamentos, visualizacoes, coletado_em) VALUES ('instagram',?,?,?,?,?,?,?,?,?,?,?,?, NOW())",
    [conta, id, tipo, `Legenda ${id}`, `https://www.instagram.com/p/${id}/`, new Date(quando), m.alcance ?? null, m.curtidas ?? null, m.comentarios ?? null, m.compartilhamentos ?? null, m.salvamentos ?? null, m.visualizacoes ?? null]);
}

beforeAll(async () => {
  process.env.TOKEN_ENC_KEY = "chave-de-teste-para-cifrar-tokens-0123456789";
  await resetTestDb(); e = await equipePadrao();
  await execute("INSERT INTO redes_contas (rede, nome_exibicao, conta_externa_id, status, token_enc, meta) VALUES ('instagram','@novaberith','ig1','conectada',?, '{}')", [cifrar("t")]);
  await execute("INSERT INTO instagram_contas (ig_id, usuario, page_id, token_enc, status, conectada_em) VALUES ('ig2','@outra',NULL,?, 'conectada', NOW())", [cifrar("t2")]);
  await execute("INSERT INTO instagram_mensal (conta_id, periodo, alcance, visualizacoes, visitas_perfil, interacoes, curtidas, atualizado_em) VALUES ('ig1','2026-10',2000,9000,150,400,300,NOW()), ('ig1','2026-09',1000,6000,100,500,350,NOW()), ('ig2','2026-10',77,NULL,NULL,NULL,NULL,NOW())");
  await execute("INSERT INTO metricas_conta (rede, conta_id, dia, seguidores) VALUES ('instagram','ig1','2026-09-30',1000), ('instagram','ig1','2026-10-10',1050), ('instagram','ig1','2026-10-18',1100), ('instagram','ig2','2026-10-18',9)");
  // meia-noite em Recife/SP (UTC-3): 01/10 02:00Z ainda é 30/09 local; 01/11 02:00Z ainda é 31/10 local
  await post("ig1", "a", "2026-10-12T15:00:00Z", { curtidas: 80, comentarios: 10, compartilhamentos: 5, salvamentos: 15, alcance: 1000 }, "REELS"); // 110 interações
  await post("ig1", "b", "2026-10-15T15:00:00Z", { curtidas: 20, comentarios: 2 });                                                                    // 22
  await post("ig1", "c", "2026-10-20T15:00:00Z", {});                                                                                                   // 0 (sem métricas)
  await post("ig1", "borda1", "2026-10-01T02:00:00Z", { curtidas: 999 });   // 30/09 local: fora de outubro
  await post("ig1", "borda2", "2026-11-01T02:00:00Z", { curtidas: 50 });    // 31/10 local: dentro de outubro
  await post("ig1", "setembro", "2026-09-10T15:00:00Z", { curtidas: 40 });
  await post("ig2", "outra1", "2026-10-11T15:00:00Z", { curtidas: 5 });
});
afterAll(closePool);

describe("relatório mensal do Instagram", () => {
  it("valida o mês e calcula o anterior (virada de ano)", () => {
    expect(() => validarMes("2026-13")).toThrow(DomainError);
    expect(() => validarMes("26-10")).toThrow(DomainError);
    expect(mesAnterior("2026-10")).toBe("2026-09"); expect(mesAnterior("2026-01")).toBe("2025-12");
    expect(rotuloMes("2026-03")).toBe("Março de 2026");
  });
  it("variação percentual só quando dá para comparar (sem inventar)", () => {
    expect(variacaoPct(2000, 1000)).toBe(100); expect(variacaoPct(500, 1000)).toBe(-50); expect(variacaoPct(1050, 1000)).toBe(5);
    expect(variacaoPct(10, 0)).toBeNull(); expect(variacaoPct(null, 5)).toBeNull(); expect(variacaoPct(5, undefined)).toBeNull();
  });
  it("interações = curtidas + comentários + compartilhamentos + salvamentos (ausente conta 0)", () => {
    expect(interacoesDe({ curtidas: 80, comentarios: 10, compartilhamentos: 5, salvamentos: 15 })).toBe(110);
    expect(interacoesDe({ curtidas: null, comentarios: null, compartilhamentos: null, salvamentos: null })).toBe(0);
  });
  it("monta os totais do mês, o anterior, os seguidores e os posts na ordem do ranking (data no fuso local)", async () => {
    const r = await gerarRelatorioMensal(e.coord, "2026-10");
    expect(r.rotuloMes).toBe("Outubro de 2026"); expect(r.conta).toBe("@novaberith"); expect(r.contaId).toBe("ig1");
    expect(r.atual).toMatchObject({ alcance: 2000, visualizacoes: 9000, visitasPerfil: 150, interacoes: 400, curtidas: 300, comentarios: null });
    expect(r.anteriorTotais).toMatchObject({ alcance: 1000, interacoes: 500 });
    expect(r.seguidores).toBe(1100); expect(r.seguidoresAnterior).toBe(1000); // último registro de cada mês
    expect(r.posts.map((p) => p.id)).toEqual(["a", "borda2", "b", "c"]); // por interações; "borda1" (30/09 local) fica de fora, "borda2" (31/10 local) entra
    expect(r.posts[0]).toMatchObject({ interacoes: 110, alcance: 1000 });
    expect(r.reels).toBe(1); expect(r.feed).toBe(3);
    expect(r.formatos[0]).toMatchObject({ tipo: "Feed", posts: 3 });
  });
  it("mês sem dados volta vazio (nada inventado)", async () => {
    const r = await gerarRelatorioMensal(e.coord, "2025-01");
    expect(r.atual).toBeNull(); expect(r.anteriorTotais).toBeNull(); expect(r.seguidores).toBeNull(); expect(r.posts).toEqual([]);
  });
  it("escolhe a conta: cada uma só vê os próprios dados; conta desconhecida cai na principal", async () => {
    const r2 = await gerarRelatorioMensal(e.coord, "2026-10", "ig2");
    expect(r2.conta).toBe("@outra"); expect(r2.atual).toMatchObject({ alcance: 77 }); expect(r2.posts.map((p) => p.id)).toEqual(["outra1"]); expect(r2.seguidores).toBe(9);
    expect(r2.contas.map((c) => [c.igId, c.principal])).toEqual([["ig1", true], ["ig2", false]]);
    expect((await gerarRelatorioMensal(e.coord, "2026-10", "qualquer")).contaId).toBe("ig1");
  });
  it("só quem tem a permissão de ver relatórios acessa", async () => {
    await expect(gerarRelatorioMensal(e.integ, "2026-10")).rejects.toBeInstanceOf(ForbiddenError);
    await expect(gerarRelatorioMensal(e.semPerfil, "2026-10")).rejects.toBeInstanceOf(ForbiddenError);
    await gerarRelatorioMensal(e.aprov, "2026-10").catch((err) => expect(err).toBeInstanceOf(ForbiddenError));
  });
});

describe("melhor dia e horário", () => {
  const p = (iso: string, interacoes: number) => ({ publicado_em: new Date(iso), interacoes });
  it("não indica nada com amostra pequena", () => {
    expect(melhoresHorarios([p("2026-10-14T15:00:00Z", 50)])).toEqual({ amostra: 1, minimo: 8, melhor: null });
  });
  it("indica dia e hora (fuso local) pela média de interações e marca a confiança", () => {
    const quartas = ["2026-10-07", "2026-10-14", "2026-10-21", "2026-10-28"].map((d) => p(`${d}T15:00:00Z`, 100)); // quarta, 12h local
    const outros = [10, 11, 12, 13, 14].map((d) => p(`2026-10-${d}T01:00:00Z`, 5));
    expect(melhoresHorarios([...quartas, ...outros]).melhor).toMatchObject({ dia: "Quarta", hora: 12, confianca: "alta" });
  });
});

describe("exportações do relatório mensal", () => {
  it("Excel e PDF trazem indicadores, comparação e posts", async () => {
    const r = await gerarRelatorioMensal(e.coord, "2026-10");
    const planilhas = paraPlanilhas(r);
    expect(planilhas.map((x) => x.nome)).toEqual(["Resumo", "Posts do mês"]);
    expect(planilhas[0].linhas.find((l) => l[0] === "Alcance")).toEqual(["Alcance", 2000, 1000, 100]);
    expect(planilhas[0].linhas.find((l) => l[0] === "Comentários")).toEqual(["Comentários", "", "", ""]); // sem dado → vazio, nunca 0
    expect(planilhas[1].linhas).toHaveLength(1 + 4);
    expect(gerarXlsx(planilhas).length).toBeGreaterThan(1000);
    const pdf = await gerarPdf(paraPdf(r, "Comunicação"));
    expect(Buffer.from(pdf.slice(0, 4)).toString()).toBe("%PDF");
  });
});
