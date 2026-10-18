import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtemp, readdir, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { execute, query, closePool } from "@/lib/db";
import { ForbiddenError } from "@/lib/permissions";
import { DomainError, NotFoundError } from "@/lib/services/errors";
import * as M from "@/lib/services/midia";
import * as P from "@/lib/services/publicacoes";
import { detectarMidia, dimensoesImagem, lerRange, nomeSeguro } from "@/lib/storage/tipos";
import { equipePadrao, pubBase, resetTestDb } from "./helpers";

let e: Awaited<ReturnType<typeof equipePadrao>>;
let dir: string;
beforeAll(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "nb-midia-")); process.env.STORAGE_DIR = dir;
  process.env.MEDIA_URL_SECRET = "segredo-de-teste-para-urls-assinadas-123456";
  await resetTestDb(); e = await equipePadrao();
});
afterAll(closePool);

const png = (w = 1080, h = 1350, extra = 0) => {
  const b = Buffer.alloc(33 + extra);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b, 0); b.writeUInt32BE(13, 8); b.write("IHDR", 12); b.writeUInt32BE(w, 16); b.writeUInt32BE(h, 20);
  return b;
};
const jpeg = (w = 800, h = 600, extra = 0) => {
  // SOI + APP0 + SOF0
  const b = Buffer.alloc(40 + extra);
  b.set([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10], 0); b.write("JFIF", 6);
  b.set([0xff, 0xc0, 0x00, 0x11, 0x08], 20); b.writeUInt16BE(h, 25); b.writeUInt16BE(w, 27);
  return b;
};
const mp4 = (extra = 100) => { const b = Buffer.alloc(32 + extra); b.writeUInt32BE(24, 0); b.write("ftypisom", 4); return b; };
const fluxo = (b: Buffer, partes = 3) => new ReadableStream<Uint8Array>({
  start(c) { const t = Math.ceil(b.length / partes); for (let i = 0; i < b.length; i += t) c.enqueue(new Uint8Array(b.subarray(i, i + t))); c.close(); },
});

describe("detecção do tipo real", () => {
  it("reconhece imagens e vídeos pela assinatura, ignorando o nome", () => {
    expect(detectarMidia(png())?.mime).toBe("image/png"); expect(detectarMidia(jpeg())?.mime).toBe("image/jpeg");
    expect(detectarMidia(mp4())?.mime).toBe("video/mp4");
    const mov = Buffer.alloc(40); mov.writeUInt32BE(24, 0); mov.write("ftypqt  ", 4); expect(detectarMidia(mov)?.mime).toBe("video/quicktime");
    expect(detectarMidia(Buffer.from([0x1a, 0x45, 0xdf, 0xa3, ...new Array(20).fill(0)]))?.mime).toBe("video/webm");
  });
  it("recusa executáveis, scripts, SVG, PDF e áudio", () => {
    for (const conteudo of ["MZ\x90\x00\x03\x00\x00\x00\x04\x00\x00\x00", "<?php system($_GET[1]); ?>......", "<svg xmlns='http://www.w3.org/2000/svg'><script>alert(1)</script></svg>", "%PDF-1.7\n1 0 obj<<>>endobj", "ID3\x03\x00\x00\x00\x00\x00\x00\x00\x00"]) {
      expect(detectarMidia(Buffer.from(conteudo))).toBeNull();
    }
    expect(detectarMidia(Buffer.alloc(4))).toBeNull();
  });
  it("lê dimensões de PNG e JPEG", () => {
    expect(dimensoesImagem(png(1080, 1350))).toEqual({ largura: 1080, altura: 1350 });
    expect(dimensoesImagem(jpeg(800, 600))).toEqual({ largura: 800, altura: 600 });
    expect(dimensoesImagem(Buffer.alloc(30))).toBeNull();
  });
  it("sanitiza nomes e interpreta Range", () => {
    expect(nomeSeguro("../../etc/passwd.png", "png")).toBe("passwd.png"); expect(nomeSeguro('a"<b>.jpg', "jpg")).toBe("ab.jpg");
    expect(lerRange("bytes=0-99", 1000)).toEqual({ inicio: 0, fim: 99 }); expect(lerRange("bytes=-100", 1000)).toEqual({ inicio: 900, fim: 999 });
    expect(lerRange("bytes=2000-", 1000)).toBe("invalido"); expect(lerRange(null, 1)).toBeNull();
  });
});

describe("envio para a biblioteca", () => {
  it("grava em fluxo, calcula SHA-256, dimensões e guarda fora de public/", async () => {
    const r = await M.receberUpload(e.integ, { nome: "Cartaz Missa.png", corpo: fluxo(png(1080, 1350, 5000)), pastaId: null });
    expect(r.duplicada).toBe(false);
    const m = await M.getMidia(e.integ, r.id);
    expect(m).toMatchObject({ tipo: "imagem", mime: "image/png", largura: 1080, altura: 1350, nome_original: "Cartaz Missa.png" });
    expect(m.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect((await stat(path.join(dir, m.arquivo.slice(0, 2), m.arquivo))).size).toBe(5033);
    expect(path.resolve(dir)).not.toContain(`${path.sep}public`);
  });
  it("identifica duplicado (mesmo conteúdo) e reaproveita o arquivo existente", async () => {
    const b = jpeg(600, 600, 777);
    const a = await M.receberUpload(e.integ, { nome: "a.jpg", corpo: fluxo(b), pastaId: null });
    const d = await M.receberUpload(e.integ2, { nome: "outro-nome.jpg", corpo: fluxo(b), pastaId: null });
    expect(d).toEqual({ id: a.id, duplicada: true });
    const arquivos = (await readdir(dir, { recursive: true })).filter((f) => /^[0-9a-f]{2}[\\/][0-9a-f]{32}$/.test(f));
    expect(arquivos.length).toBe((await query<any>("SELECT COUNT(*) n FROM midias"))[0].n); // nenhum arquivo órfão
  });
  it("recusa tipo inválido sem deixar resto no disco", async () => {
    const soArquivos = async () => (await readdir(dir, { recursive: true })).filter((f) => /[0-9a-f]{32}(\.parcial)?$/.test(f)).length;
    const antes = await soArquivos();
    await expect(M.receberUpload(e.integ, { nome: "x.png", corpo: fluxo(Buffer.from("<?php echo 1; ?>" + "x".repeat(100))), pastaId: null })).rejects.toThrow(/não permitido/);
    await expect(M.receberUpload(e.integ, { nome: "vazio.png", corpo: fluxo(Buffer.alloc(0)), pastaId: null })).rejects.toBeInstanceOf(DomainError);
    expect(await soArquivos()).toBe(antes);
  });
  it("respeita o limite de tamanho por tipo", async () => {
    process.env.MAX_VIDEO_MB = "20";
    const grande = mp4(21 * 1024 * 1024);
    await expect(M.receberUpload(e.integ, { nome: "v.mp4", corpo: fluxo(grande, 20), pastaId: null })).rejects.toThrow(/grande demais/);
    const imgGrande = png(10, 10, 16 * 1024 * 1024);
    await expect(M.receberUpload(e.integ, { nome: "i.png", corpo: fluxo(imgGrande, 20), pastaId: null })).rejects.toThrow(/Limite de 15 MB/);
    const ok = await M.receberUpload(e.integ, { nome: "ok.mp4", corpo: fluxo(mp4(2048)), pastaId: null });
    expect((await M.getMidia(e.integ, ok.id)).tipo).toBe("video");
    delete process.env.MAX_VIDEO_MB;
  });
  it("só quem tem permissão envia", async () => {
    await expect(M.receberUpload(e.aprov, { nome: "a.png", corpo: fluxo(png()), pastaId: null })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(M.receberUpload(e.semPerfil, { nome: "a.png", corpo: fluxo(png()), pastaId: null })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(M.receberUpload(e.integ, { nome: "a.png", corpo: fluxo(png(5, 5, 9)), pastaId: 9999 })).rejects.toBeInstanceOf(DomainError);
  });
});

describe("organização, busca e remoção", () => {
  it("pastas, etiquetas, busca e filtros", async () => {
    const pasta = await M.criarPasta(e.coord, "Campanha Advento", null);
    await expect(M.criarPasta(e.coord, "Campanha Advento", null)).rejects.toThrow(/Já existe/);
    const filha = await M.criarPasta(e.coord, "Stories", pasta);
    const a = await M.receberUpload(e.integ, { nome: "natal-capa.png", corpo: fluxo(png(1, 1, 300)), pastaId: pasta });
    await M.atualizarMidia(e.integ, a.id, { descricao: "Capa do Natal", textoAlternativo: "Presépio iluminado", pastaId: pasta, etiquetas: ["Natal", " natal ", "capa"] });
    const m = await M.getMidia(e.integ, a.id);
    expect(m.etiquetas).toBe("capa,natal"); expect(m.texto_alternativo).toBe("Presépio iluminado");
    expect((await M.listar(e.integ, { q: "natal" })).itens.map((x) => x.id)).toContain(a.id);
    expect((await M.listar(e.integ, { etiqueta: "capa" })).total).toBe(1);
    expect((await M.listar(e.integ, { pastaId: pasta })).itens).toHaveLength(1);
    expect((await M.listar(e.integ, { tipo: "video" })).itens.every((x) => x.tipo === "video")).toBe(true);
    expect((await M.listarPastas(e.integ)).find((p) => p.id === pasta)?.total).toBe(1);
    await expect(M.excluirPasta(e.admin, pasta)).rejects.toThrow(/não está vazia/);
    await M.excluirPasta(e.admin, filha);
    // integrante não edita mídia de outra pessoa
    await expect(M.atualizarMidia(e.integ2, a.id, { descricao: null, textoAlternativo: null, pastaId: null, etiquetas: [] })).rejects.toBeInstanceOf(ForbiddenError);
    await M.atualizarMidia(e.coord, a.id, { descricao: "Capa do Natal", textoAlternativo: null, pastaId: pasta, etiquetas: ["natal"] });
  });
  it("não remove mídia em uso; remove (lixeira) e purga o arquivo depois", async () => {
    const a = await M.receberUpload(e.integ, { nome: "usada.png", corpo: fluxo(png(2, 2, 400)), pastaId: null });
    const pub = await P.criar(e.integ, pubBase({ midiaIds: [a.id] }), { prazo: null, publicarEm: null });
    await expect(M.removerMidia(e.coord, a.id)).rejects.toThrow(/usada em 1/);
    await expect(M.removerMidia(e.integ, a.id)).rejects.toBeInstanceOf(ForbiddenError);
    await P.cancelar(e.integ, pub, null);
    await M.removerMidia(e.coord, a.id);
    await expect(M.getMidia(e.coord, a.id)).rejects.toBeInstanceOf(NotFoundError);
    const arq = (await query<any>("SELECT arquivo FROM midias WHERE id = ?", [a.id]))[0].arquivo;
    expect(await M.purgarRemovidas(30)).toBe(0); // ainda dentro do prazo
    await execute("UPDATE midias SET removido_em = DATE_SUB(UTC_TIMESTAMP(), INTERVAL 31 DAY) WHERE id = ?", [a.id]);
    expect(await M.purgarRemovidas(30)).toBe(1);
    await expect(stat(path.join(dir, arq.slice(0, 2), arq))).rejects.toThrow();
  });
  it("reenviar arquivo da lixeira o restaura", async () => {
    const b = png(3, 3, 321);
    const a = await M.receberUpload(e.integ, { nome: "r.png", corpo: fluxo(b), pastaId: null });
    await M.removerMidia(e.coord, a.id);
    const r = await M.receberUpload(e.integ, { nome: "r2.png", corpo: fluxo(b), pastaId: null });
    expect(r).toEqual({ id: a.id, duplicada: true }); expect((await M.getMidia(e.integ, a.id)).id).toBe(a.id);
  });
  it("lista nomes repetidos como possíveis duplicados", async () => {
    await M.receberUpload(e.integ, { nome: "Banner.png", corpo: fluxo(png(7, 7, 11)), pastaId: null });
    await M.receberUpload(e.integ, { nome: "banner.png", corpo: fluxo(png(7, 7, 12)), pastaId: null });
    expect((await M.nomesRepetidos(e.integ)).some((x) => x.nome === "banner.png" && x.ids.length === 2)).toBe(true);
  });
});

describe("URL pública temporária assinada", () => {
  it("valida assinatura, expiração e id", () => {
    const base = "https://app.exemplo.org";
    const agora = 1_800_000_000_000;
    const url = new URL(M.urlPublicaTemporaria(base, 42, 600, agora));
    const exp = Number(url.searchParams.get("exp")), sig = url.searchParams.get("sig")!;
    expect(url.pathname).toBe("/api/midias/publica/42");
    expect(M.assinaturaValida(42, exp, sig, agora + 1000)).toBe(true);
    expect(M.assinaturaValida(43, exp, sig, agora + 1000)).toBe(false); // outro arquivo
    expect(M.assinaturaValida(42, exp + 1, sig, agora + 1000)).toBe(false); // expiração adulterada
    expect(M.assinaturaValida(42, exp, sig, agora + 601_000)).toBe(false); // expirada
    expect(M.assinaturaValida(42, exp, sig.slice(0, -2) + "xx", agora)).toBe(false);
    expect(M.assinaturaValida(42, exp, "", agora)).toBe(false);
  });
  it("sem segredo configurado, recusa gerar o link", () => {
    const antes = { a: process.env.MEDIA_URL_SECRET, b: process.env.TOKEN_ENC_KEY, c: process.env.CRON_SECRET };
    delete process.env.MEDIA_URL_SECRET; delete process.env.TOKEN_ENC_KEY; delete process.env.CRON_SECRET;
    expect(() => M.urlPublicaTemporaria("https://x.org", 1)).toThrow(/MEDIA_URL_SECRET/);
    process.env.MEDIA_URL_SECRET = antes.a!; if (antes.b) process.env.TOKEN_ENC_KEY = antes.b; if (antes.c) process.env.CRON_SECRET = antes.c;
  });
});
