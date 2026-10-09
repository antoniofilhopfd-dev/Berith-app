import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { mkdtemp, rm, readdir, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";

// Sessão simulada: cada teste define de quem é a requisição.
let tokenAtual: string | null = null;
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (n: string) => (tokenAtual && n.includes("nb_session") ? { value: tokenAtual } : undefined), set: () => {}, delete: () => {} }),
  headers: async () => new Headers({ host: "localhost" }),
}));

import { NextRequest } from "next/server";
import { closePool, execute, query } from "@/lib/db";
import { detectarTipo, lerRange, nomeSeguro } from "@/lib/storage/tipos";
import { storageDir } from "@/lib/storage/disco";
import { abrirArquivo, criarAlbum, enviarArquivo, excluirAlbum, excluirArquivo, getAlbum, historicoAlbum, listarAlbuns, listarAnexos } from "@/lib/services/arquivos";
import { createComunicado } from "@/lib/services/comunicados";
import { createTask } from "@/lib/services/tarefas";
import { comunicadoSchema } from "@/lib/validation/eventos";
import { tarefaSchema } from "@/lib/validation/organizacao";
import { albumSchema } from "@/lib/validation/formacao";
import { ForbiddenError } from "@/lib/permissions";
import { DomainError, NotFoundError } from "@/lib/services/errors";
import { POST as upload } from "@/app/api/arquivos/route";
import { GET as baixar } from "@/app/api/arquivos/[id]/route";
import { resetTestDb, criarUsuario, criarUnidade, darPapel, vincular } from "./helpers";

const PDF = new Uint8Array([...Buffer.from("%PDF-1.4\n"), ...Buffer.from("conteudo de teste do pdf ".repeat(20))]);
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...Buffer.alloc(200, 7)]);
const JPG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, ...Buffer.alloc(200, 9)]);
const MP3 = new Uint8Array([...Buffer.from("ID3"), 3, 0, 0, 0, 0, 0, 0, ...Buffer.alloc(3000, 5)]);
const unico = (b: Uint8Array, n: number) => new Uint8Array([...b, ...Buffer.from(`#${n}`)]);

let dir = "", admin = 0, com = 0, coordA = 0, coordB = 0, membroA = 0, membroB = 0, resp = 0, A = 0, B = 0;
const tokens = new Map<number, string>();
async function sessao(userId: number) {
  const t = `tok-${userId}-${Math.random().toString(36).slice(2)}`;
  await execute("INSERT INTO sessions (user_id, token_hash, expira_em) VALUES (?, ?, DATE_ADD(UTC_TIMESTAMP(), INTERVAL 1 DAY))", [userId, createHash("sha256").update(t).digest("hex")]);
  tokens.set(userId, t);
}
const como = (u: number | null) => { tokenAtual = u ? tokens.get(u)! : null; };
const multipart = (campos: Record<string, string>, nome: string, dados: Uint8Array, mime = "application/octet-stream") => {
  const f = new FormData(); for (const [k, v] of Object.entries(campos)) f.set(k, v);
  f.set("arquivo", new File([new Uint8Array(dados)], nome, { type: mime }));
  return new NextRequest("http://localhost/api/arquivos", { method: "POST", body: f, headers: { host: "localhost", origin: "http://localhost" } });
};
const get = (id: number, h: Record<string, string> = {}, q = "") => baixar(new NextRequest(`http://localhost/api/arquivos/${id}${q}`, { headers: h }), { params: Promise.resolve({ id: String(id) }) });

beforeAll(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "nb-storage-"));
  process.env.STORAGE_DIR = dir;
  await resetTestDb();
  admin = await criarUsuario("a@t.com"); com = await criarUsuario("c@t.com"); coordA = await criarUsuario("ca@t.com"); coordB = await criarUsuario("cb@t.com");
  membroA = await criarUsuario("ma@t.com"); membroB = await criarUsuario("mb@t.com"); resp = await criarUsuario("r@t.com");
  await darPapel(admin, "admin_geral"); await darPapel(com, "resp_comunicacao");
  A = await criarUnidade("ministerio", "A"); B = await criarUnidade("ministerio", "B");
  await darPapel(coordA, "coord_ministerio", A); await darPapel(coordB, "coord_ministerio", B);
  await vincular(membroA, A); await vincular(membroB, B); await vincular(resp, A);
  for (const u of [admin, com, coordA, coordB, membroA, membroB, resp]) await sessao(u);
});
afterAll(async () => { await closePool(); await rm(dir, { recursive: true, force: true }); delete process.env.STORAGE_DIR; });

describe("tipos de arquivo (assinatura binária)", () => {
  it("reconhece os formatos aceitos", () => {
    expect(detectarTipo(PDF)?.mime).toBe("application/pdf"); expect(detectarTipo(PNG)?.mime).toBe("image/png");
    expect(detectarTipo(JPG)?.mime).toBe("image/jpeg"); expect(detectarTipo(MP3)?.mime).toBe("audio/mpeg");
  });
  it("recusa executáveis, HTML, SVG e arquivos disfarçados", () => {
    for (const conteudo of ["MZ\x90\x00\x03\x00\x00\x00 executavel", "<html><script>alert(1)</script></html>", "<svg xmlns='http://www.w3.org/2000/svg' onload='alert(1)'/>", "#!/bin/sh\nrm -rf /", "PK\x03\x04 zip qualquer"]) {
      expect(detectarTipo(new Uint8Array(Buffer.from(conteudo.padEnd(40, " "))))).toBeNull();
    }
    expect(detectarTipo(new Uint8Array(4))).toBeNull();
  });
  it("nome do arquivo é saneado (sem caminhos nem caracteres perigosos)", () => {
    expect(nomeSeguro("../../etc/passwd.pdf", "pdf")).toBe("passwd.pdf");
    expect(nomeSeguro('a"<b>.exe', "pdf")).toBe("ab.pdf");
    expect(nomeSeguro("", "png")).toBe("arquivo.png");
  });
  it("interpreta intervalos HTTP Range", () => {
    expect(lerRange("bytes=0-99", 1000)).toEqual({ inicio: 0, fim: 99 });
    expect(lerRange("bytes=500-", 1000)).toEqual({ inicio: 500, fim: 999 });
    expect(lerRange("bytes=-100", 1000)).toEqual({ inicio: 900, fim: 999 });
    expect(lerRange("bytes=0-5000", 1000)).toEqual({ inicio: 0, fim: 999 });
    expect(lerRange(null, 1000)).toBeNull();
    for (const r of ["bytes=1000-1001", "bytes=9-3", "lixo", "bytes=-", "bytes=-0"]) expect(lerRange(r, 1000)).toBe("invalido");
  });
});

describe("anexos em comunicados e tarefas", () => {
  let cid = 0, tid = 0;
  beforeAll(async () => {
    cid = await createComunicado(coordA, comunicadoSchema.parse({ titulo: "Aviso com anexo", corpo: "Veja o PDF", unitId: String(A) }));
    tid = await createTask(coordA, tarefaSchema.parse({ unitId: String(A), titulo: "Tarefa com anexo", responsavelEmail: "r@t.com" }));
  });
  it("só quem edita o comunicado anexa; integrante e outras estruturas não", async () => {
    await expect(enviarArquivo(membroA, { tipo: "comunicado", ctxId: cid, nome: "a.pdf", dados: PDF })).rejects.toThrow(ForbiddenError);
    await expect(enviarArquivo(coordB, { tipo: "comunicado", ctxId: cid, nome: "a.pdf", dados: PDF })).rejects.toThrow(NotFoundError);
    expect(await enviarArquivo(coordA, { tipo: "comunicado", ctxId: cid, nome: "regras.pdf", dados: PDF })).toBeGreaterThan(0);
  });
  it("destinatário baixa; quem não é destinatário recebe 404", async () => {
    const [f] = await query<any>("SELECT id FROM files WHERE ctx_tipo='comunicado' AND ctx_id = ?", [cid]);
    como(membroA); const ok = await get(f.id); expect(ok.status).toBe(200);
    expect(ok.headers.get("content-type")).toBe("application/pdf"); expect(ok.headers.get("cache-control")).toContain("no-store");
    expect(ok.headers.get("x-content-type-options")).toBe("nosniff");
    expect(Buffer.from(await ok.arrayBuffer()).equals(Buffer.from(PDF))).toBe(true);
    como(membroB); expect((await get(f.id)).status).toBe(404);
    como(coordB); expect((await get(f.id)).status).toBe(404);
    como(null); expect((await get(f.id)).status).toBe(401);
  });
  it("responsável pela tarefa anexa e remove só o que enviou; coordenação remove tudo", async () => {
    const meu = await enviarArquivo(resp, { tipo: "tarefa", ctxId: tid, nome: "foto.png", dados: unico(PNG, 1) });
    const dela = await enviarArquivo(coordA, { tipo: "tarefa", ctxId: tid, nome: "plano.pdf", dados: unico(PDF, 1) });
    await expect(excluirArquivo(resp, dela)).rejects.toThrow(ForbiddenError);
    await excluirArquivo(resp, meu);
    await expect(enviarArquivo(membroA, { tipo: "tarefa", ctxId: tid, nome: "x.pdf", dados: unico(PDF, 2) })).rejects.toThrow(ForbiddenError);
    await excluirArquivo(coordA, dela);
    expect((await listarAnexos(coordA, "tarefa", tid)).arquivos).toEqual([]);
  });
  it("não aceita tipo proibido, arquivo vazio, duplicado nem acima do limite", async () => {
    await expect(enviarArquivo(coordA, { tipo: "comunicado", ctxId: cid, nome: "virus.pdf", dados: new Uint8Array(Buffer.from("MZ".padEnd(100, "x"))) })).rejects.toThrow(/Tipo de arquivo não permitido/);
    await expect(enviarArquivo(coordA, { tipo: "comunicado", ctxId: cid, nome: "v.pdf", dados: new Uint8Array(0) })).rejects.toThrow(/vazio/);
    await expect(enviarArquivo(coordA, { tipo: "comunicado", ctxId: cid, nome: "regras.pdf", dados: PDF })).rejects.toThrow(/já foi enviado/);
    const grande = new Uint8Array(16 * 1024 * 1024); grande.set(Buffer.from("%PDF-1.4\n"));
    await expect(enviarArquivo(coordA, { tipo: "comunicado", ctxId: cid, nome: "g.pdf", dados: grande })).rejects.toThrow(/Limite de 15 MB/);
  });
  it("arquivos ficam fora de public/, com nome aleatório e permissão só do dono", async () => {
    expect(storageDir()).toBe(dir); expect(dir).not.toContain("public");
    const arquivos = (await query<any>("SELECT arquivo FROM files")).map((r: any) => r.arquivo);
    expect(arquivos.every((n: string) => /^[0-9a-f]{32}$/.test(n))).toBe(true);
    expect(((await stat(path.join(dir, arquivos[0].slice(0, 2), arquivos[0]))).mode & 0o077)).toBe(0); // só o dono lê
  });
});

describe("consistência disco x banco", () => {
  it("envios idênticos simultâneos: um vence e não sobra arquivo órfão no disco", async () => {
    const cid2 = await createComunicado(coordA, comunicadoSchema.parse({ titulo: "Corrida", corpo: "texto da corrida", unitId: String(A) }));
    const dados = unico(PDF, 99);
    const r = await Promise.allSettled([1, 2, 3].map(() => enviarArquivo(coordA, { tipo: "comunicado", ctxId: cid2, nome: "mesmo.pdf", dados })));
    expect(r.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    const noDisco = (await readdir(dir, { recursive: true })).map((n) => path.basename(n)).filter((n) => /^[0-9a-f]{32}$/.test(n)).sort();
    const noBanco = (await query<any>("SELECT arquivo FROM files")).map((x: any) => x.arquivo).sort();
    expect(noDisco).toEqual(noBanco);
  });
});

describe("rotas HTTP de arquivos", () => {
  let cid = 0, audioId = 0;
  beforeAll(async () => {
    cid = await createComunicado(coordA, comunicadoSchema.parse({ titulo: "Aviso áudio", corpo: "Ouça", unitId: String(A) }));
    audioId = await enviarArquivo(coordA, { tipo: "comunicado", ctxId: cid, nome: "mensagem.mp3", dados: MP3 });
  });
  it("upload exige sessão, origem válida e permissão; ignora o Content-Type do cliente", async () => {
    como(null); expect((await upload(multipart({ ctxTipo: "comunicado", ctxId: String(cid) }, "a.pdf", unico(PDF, 3)))).status).toBe(401);
    como(membroA); expect((await upload(multipart({ ctxTipo: "comunicado", ctxId: String(cid) }, "a.pdf", unico(PDF, 3)))).status).toBe(403);
    como(coordA);
    const evil = new NextRequest("http://localhost/api/arquivos", { method: "POST", body: (() => { const f = new FormData(); f.set("ctxTipo", "comunicado"); f.set("ctxId", String(cid)); f.set("arquivo", new File([new Uint8Array(unico(PDF, 3))], "a.pdf")); return f; })(), headers: { host: "localhost", origin: "https://evil.example" } });
    expect((await upload(evil)).status).toBe(403);
    const html = await upload(multipart({ ctxTipo: "comunicado", ctxId: String(cid) }, "fake.pdf", new Uint8Array(Buffer.from("<html>".padEnd(50, " "))), "application/pdf"));
    expect(html.status).toBe(422);
    const bom = await upload(multipart({ ctxTipo: "comunicado", ctxId: String(cid) }, "../../x.pdf", unico(PDF, 3), "text/html"));
    expect(bom.status).toBe(201);
    const id = (await bom.json()).id;
    como(membroA); const r = await get(id); expect(r.headers.get("content-type")).toBe("application/pdf");
    expect((await query<any>("SELECT nome_original FROM files WHERE id = ?", [id]))[0].nome_original).toBe("x.pdf");
  });
  it("rejeita contexto inválido e corpo gigante antes de ler", async () => {
    como(coordA);
    expect((await upload(multipart({ ctxTipo: "inexistente", ctxId: "1" }, "a.pdf", PDF))).status).toBe(400);
    const gigante = new NextRequest("http://localhost/api/arquivos", { method: "POST", body: "x", headers: { host: "localhost", "content-length": String(200 * 1024 * 1024) } });
    expect((await upload(gigante)).status).toBe(413);
  });
  it("áudio responde a Range (206) como o Safari exige", async () => {
    como(membroA);
    const r = await get(audioId, { range: "bytes=0-99" });
    expect(r.status).toBe(206); expect(r.headers.get("content-range")).toBe(`bytes 0-99/${MP3.length}`);
    expect((await r.arrayBuffer()).byteLength).toBe(100);
    expect((await get(audioId, { range: "bytes=99999-" })).status).toBe(416);
    como(membroB); expect((await get(audioId, { range: "bytes=0-9" })).status).toBe(404);
  });
  it("IDs inválidos e inexistentes dão 404", async () => {
    como(coordA);
    expect((await get(999999)).status).toBe(404);
    const r = await baixar(new NextRequest("http://localhost/api/arquivos/abc"), { params: Promise.resolve({ id: "abc" }) });
    expect(r.status).toBe(404);
  });
  it("sessão revogada perde o acesso na hora", async () => {
    como(membroA); expect((await get(audioId)).status).toBe(200);
    await execute("UPDATE sessions SET revogada_em = UTC_TIMESTAMP() WHERE user_id = ?", [membroA]);
    expect((await get(audioId)).status).toBe(401);
    await sessao(membroA); como(membroA);
  });
  it("saiu da estrutura: deixa de baixar na hora", async () => {
    como(resp); expect((await get(audioId)).status).toBe(200);
    await execute("UPDATE memberships SET fim = UTC_DATE() WHERE user_id = ?", [resp]);
    expect((await get(audioId)).status).toBe(404);
  });
});

describe("álbuns de fotos", () => {
  let alb = 0, albB = 0, semDl = 0;
  const album = (o: Record<string, unknown> = {}) => albumSchema.parse({ titulo: "Retiro 2026", unitId: String(A), permitirDownload: "on", ...o });
  it("quem tem 'mídia' cria; integrante vê; outras estruturas não", async () => {
    await expect(criarAlbum(membroA, album())).rejects.toThrow(ForbiddenError);
    await expect(criarAlbum(coordA, album({ unitId: String(B) }))).rejects.toThrow(ForbiddenError);
    alb = await criarAlbum(coordA, album()); albB = await criarAlbum(coordB, album({ titulo: "Do B", unitId: String(B) }));
    expect((await listarAlbuns(membroA)).map((a) => a.titulo)).toEqual(["Retiro 2026"]);
    expect((await listarAlbuns(admin)).length).toBe(2);
    await expect(getAlbum(membroA, albB)).rejects.toThrow(NotFoundError);
  });
  it("upload de foto exige confirmação de autorização de imagem; só imagens", async () => {
    await expect(enviarArquivo(coordA, { tipo: "album", ctxId: alb, nome: "f.png", dados: unico(PNG, 10) })).rejects.toThrow(/autorização de uso de imagem/);
    await enviarArquivo(coordA, { tipo: "album", ctxId: alb, nome: "f.png", dados: unico(PNG, 10), autorizacaoImagem: true, descricao: "Missa de abertura" });
    await expect(enviarArquivo(coordA, { tipo: "album", ctxId: alb, nome: "d.pdf", dados: unico(PDF, 10), autorizacaoImagem: true })).rejects.toThrow(/somente imagens/);
    const r = await query<any>("SELECT autorizacao_imagem, descricao FROM files WHERE ctx_tipo='album' AND ctx_id = ?", [alb]);
    expect(r[0]).toMatchObject({ autorizacao_imagem: 1, descricao: "Missa de abertura" });
  });
  it("foto de outra estrutura: 404; do próprio álbum: 200", async () => {
    const [f] = await query<any>("SELECT id FROM files WHERE ctx_tipo='album' AND ctx_id = ?", [alb]);
    como(membroA); expect((await get(f.id)).status).toBe(200);
    como(membroB); expect((await get(f.id)).status).toBe(404);
  });
  it("álbum com download desativado só serve 'inline'", async () => {
    semDl = await criarAlbum(coordA, album({ titulo: "Sem download", permitirDownload: "" }));
    const id = await enviarArquivo(coordA, { tipo: "album", ctxId: semDl, nome: "g.jpg", dados: unico(JPG, 1), autorizacaoImagem: true });
    como(membroA);
    expect((await get(id)).status).toBe(200);
    expect((await get(id, {}, "?baixar=1")).status).toBe(403);
    expect((await get(id)).headers.get("content-disposition")).toMatch(/^inline/);
  });
  it("histórico do álbum é restrito a quem edita e registra envios", async () => {
    await expect(historicoAlbum(membroA, alb)).rejects.toThrow(ForbiddenError);
    const h = (await historicoAlbum(coordA, alb)).map((x) => x.acao);
    expect(h).toContain("arquivo.enviar"); expect(h).toContain("album.criar");
  });
  it("excluir álbum remove arquivos do disco e do banco, com permissão", async () => {
    const arq = (await query<any>("SELECT arquivo FROM files WHERE ctx_tipo='album' AND ctx_id = ?", [alb]))[0].arquivo;
    await expect(excluirAlbum(membroA, alb)).rejects.toThrow(ForbiddenError);
    await excluirAlbum(coordA, alb);
    expect(await query<any>("SELECT id FROM files WHERE ctx_tipo='album' AND ctx_id = ?", [alb])).toEqual([]);
    await expect(stat(path.join(dir, arq.slice(0, 2), arq))).rejects.toThrow();
  });
});

describe("documentos por estrutura", () => {
  it("biblioteca da estrutura: integrante vê, outra estrutura não; comunidade (ctx 0) visível a todos", async () => {
    const id = await enviarArquivo(coordA, { tipo: "documento", ctxId: A, nome: "estatuto.pdf", dados: unico(PDF, 20) });
    como(membroA); expect((await get(id)).status).toBe(200);
    como(membroB); expect((await get(id)).status).toBe(404);
    const geral = await enviarArquivo(com, { tipo: "documento", ctxId: 0, nome: "regimento.pdf", dados: unico(PDF, 21) });
    como(membroB); expect((await get(geral)).status).toBe(200);
    await expect(enviarArquivo(coordA, { tipo: "documento", ctxId: 0, nome: "x.pdf", dados: unico(PDF, 22) })).rejects.toThrow(ForbiddenError);
    expect(await abrirArquivo(admin, id)).toBeTruthy();
  });
});
