import { createHmac, timingSafeEqual } from "node:crypto";
import type { RowDataPacket } from "mysql2/promise";
import { execute, query, tx } from "@/lib/db";
import { assertCan, can, ForbiddenError } from "@/lib/permissions";
import { detectarMidia, dimensoesImagem, EXTENSOES_ACEITAS, limiteMB, MAX_BYTES, nomeSeguro } from "@/lib/storage/tipos";
import * as disco from "@/lib/storage/disco";
import { audit } from "./audit";
import { DomainError, NotFoundError } from "./errors";

export type Midia = {
  id: number; arquivo: string; nome_original: string; mime: string; tipo: "imagem" | "video"; tamanho: number; sha256: string;
  largura: number | null; altura: number | null; pasta_id: number | null; descricao: string | null; texto_alternativo: string | null;
  criado_por: number | null; criado_em: Date; removido_em: Date | null;
};
export type MidiaLista = Midia & { etiquetas: string | null; usos: number; autor: string | null };

/* ---------- Envio ---------- */
export type ResultadoUpload = { id: number; duplicada: boolean };

/** Recebe um corpo em fluxo: valida tipo real, tamanho, duplicidade e grava com metadados. */
export async function receberUpload(actor: number, o: { nome: string; corpo: ReadableStream<Uint8Array>; pastaId: number | null }): Promise<ResultadoUpload> {
  await assertCan(actor, "midia", "criar");
  if (o.pastaId != null && !(await query<RowDataPacket>("SELECT 1 x FROM midia_pastas WHERE id = ?", [o.pastaId]))[0]) throw new DomainError("Pasta inexistente.");
  let gravado;
  try { gravado = await disco.gravarFluxo(o.corpo, MAX_BYTES()); }
  catch (e) { if (e instanceof disco.LimiteExcedido) throw new DomainError("Arquivo grande demais."); throw e; }
  const remover = () => disco.remover(gravado.arquivo);
  try {
    if (gravado.tamanho === 0) throw new DomainError("Arquivo vazio.");
    const tipo = detectarMidia(gravado.cabecalho);
    if (!tipo) throw new DomainError(`Tipo de arquivo não permitido. Envie ${EXTENSOES_ACEITAS}.`);
    if (gravado.tamanho > limiteMB(tipo) * 1024 * 1024) throw new DomainError(`Limite de ${limiteMB(tipo)} MB para ${tipo.tipo === "imagem" ? "imagens" : "vídeos"}.`);
    const dup = (await query<RowDataPacket>("SELECT id, removido_em FROM midias WHERE sha256 = ?", [gravado.sha256]))[0];
    if (dup) {
      await remover();
      if (dup.removido_em) { await execute("UPDATE midias SET removido_em = NULL WHERE id = ?", [dup.id]); await audit(actor, "midia.restaurar", { entidade: "midia", entidadeId: dup.id }); }
      return { id: Number(dup.id), duplicada: true };
    }
    const dim = tipo.tipo === "imagem" ? dimensoesImagem(gravado.cabecalho) : null;
    const r = await execute(
      "INSERT INTO midias (arquivo, nome_original, mime, tipo, tamanho, sha256, largura, altura, pasta_id, criado_por) VALUES (?,?,?,?,?,?,?,?,?,?)",
      [gravado.arquivo, nomeSeguro(o.nome, tipo.ext), tipo.mime, tipo.tipo, gravado.tamanho, gravado.sha256, dim?.largura ?? null, dim?.altura ?? null, o.pastaId, actor]);
    await audit(actor, "midia.enviar", { entidade: "midia", entidadeId: r.insertId, detalhes: { mime: tipo.mime, tamanho: gravado.tamanho } });
    return { id: r.insertId, duplicada: false };
  } catch (e) { await remover(); throw e; }
}

/* ---------- Leitura ---------- */
export type FiltroMidia = { q?: string; tipo?: "imagem" | "video"; pastaId?: number | "raiz" | "todas"; etiqueta?: string; pagina?: number; porPagina?: number };
export const POR_PAGINA = 24;

export async function listar(actor: number, f: FiltroMidia = {}): Promise<{ itens: MidiaLista[]; total: number }> {
  await assertCan(actor, "midia", "ver");
  const w = ["m.removido_em IS NULL"]; const p: unknown[] = [];
  if (f.tipo) { w.push("m.tipo = ?"); p.push(f.tipo); }
  if (f.pastaId === "raiz") w.push("m.pasta_id IS NULL");
  else if (typeof f.pastaId === "number") { w.push("m.pasta_id = ?"); p.push(f.pastaId); }
  if (f.q) { const l = `%${f.q.replace(/[%_\\]/g, "\\$&")}%`; w.push("(m.nome_original LIKE ? OR m.descricao LIKE ? OR EXISTS (SELECT 1 FROM midia_etiqueta_rel r JOIN midia_etiquetas e ON e.id = r.etiqueta_id WHERE r.midia_id = m.id AND e.nome LIKE ?))"); p.push(l, l, l); }
  if (f.etiqueta) { w.push("EXISTS (SELECT 1 FROM midia_etiqueta_rel r JOIN midia_etiquetas e ON e.id = r.etiqueta_id WHERE r.midia_id = m.id AND e.nome = ?)"); p.push(f.etiqueta); }
  const where = w.join(" AND ");
  const por = f.porPagina ?? POR_PAGINA, pg = Math.max(1, f.pagina ?? 1);
  const total = Number((await query<RowDataPacket>(`SELECT COUNT(*) n FROM midias m WHERE ${where}`, p))[0].n);
  const itens = await query<MidiaLista & RowDataPacket>(
    `SELECT m.*, u.nome AS autor,
       (SELECT GROUP_CONCAT(e.nome ORDER BY e.nome SEPARATOR ',') FROM midia_etiqueta_rel r JOIN midia_etiquetas e ON e.id = r.etiqueta_id WHERE r.midia_id = m.id) AS etiquetas,
       (SELECT COUNT(*) FROM publicacao_midias pm WHERE pm.midia_id = m.id) AS usos
     FROM midias m LEFT JOIN users u ON u.id = m.criado_por WHERE ${where} ORDER BY m.id DESC LIMIT ? OFFSET ?`, [...p, por, (pg - 1) * por]);
  return { itens, total };
}

export async function getMidia(actor: number, id: number): Promise<MidiaLista> {
  await assertCan(actor, "midia", "ver");
  const r = (await query<MidiaLista & RowDataPacket>(
    `SELECT m.*, u.nome AS autor,
       (SELECT GROUP_CONCAT(e.nome ORDER BY e.nome SEPARATOR ',') FROM midia_etiqueta_rel r JOIN midia_etiquetas e ON e.id = r.etiqueta_id WHERE r.midia_id = m.id) AS etiquetas,
       (SELECT COUNT(*) FROM publicacao_midias pm WHERE pm.midia_id = m.id) AS usos
     FROM midias m LEFT JOIN users u ON u.id = m.criado_por WHERE m.id = ? AND m.removido_em IS NULL`, [id]))[0];
  if (!r) throw new NotFoundError();
  return r;
}

/** Midias selecionáveis para anexar a uma publicação (leve; sem contagens). */
export async function pesquisarParaSelecao(actor: number, q: string, limite = 60) {
  await assertCan(actor, "midia", "ver");
  const l = `%${q.replace(/[%_\\]/g, "\\$&")}%`;
  return query<RowDataPacket & { id: number; nome_original: string; tipo: "imagem" | "video"; largura: number | null; altura: number | null }>(
    `SELECT id, nome_original, tipo, largura, altura FROM midias WHERE removido_em IS NULL ${q ? "AND nome_original LIKE ?" : ""} ORDER BY id DESC LIMIT ?`, q ? [l, limite] : [limite]);
}

export async function midiasPorIds(ids: number[]) {
  if (ids.length === 0) return [];
  return query<RowDataPacket & { id: number; nome_original: string; tipo: "imagem" | "video"; largura: number | null; altura: number | null }>(
    "SELECT id, nome_original, tipo, largura, altura FROM midias WHERE id IN (?) AND removido_em IS NULL", [ids]);
}

export async function abrirMidia(actor: number, id: number) {
  const m = await getMidia(actor, id);
  if (!(await disco.existe(m.arquivo))) throw new NotFoundError();
  return m;
}

/** Nomes de arquivo repetidos (possíveis duplicados com conteúdo diferente). */
export async function nomesRepetidos(actor: number): Promise<{ nome: string; ids: number[] }[]> {
  await assertCan(actor, "midia", "ver");
  const r = await query<RowDataPacket>(
    `SELECT LOWER(nome_original) n, GROUP_CONCAT(id ORDER BY id) ids FROM midias WHERE removido_em IS NULL GROUP BY LOWER(nome_original) HAVING COUNT(*) > 1 LIMIT 100`);
  return r.map((x) => ({ nome: String(x.n), ids: String(x.ids).split(",").map(Number) }));
}

/* ---------- Edição ---------- */
async function podeEditarMidia(actor: number, m: { criado_por: number | null }) {
  return (await can(actor, "midia", "editar")) || (m.criado_por === actor && (await can(actor, "midia", "criar")));
}

export async function atualizarMidia(actor: number, id: number, d: { descricao: string | null; textoAlternativo: string | null; pastaId: number | null; etiquetas: string[] }) {
  const m = await getMidia(actor, id);
  if (!(await podeEditarMidia(actor, m))) throw new ForbiddenError();
  if (d.pastaId != null && !(await query<RowDataPacket>("SELECT 1 x FROM midia_pastas WHERE id = ?", [d.pastaId]))[0]) throw new DomainError("Pasta inexistente.");
  const nomes = [...new Set(d.etiquetas.map((e) => e.trim().toLowerCase()).filter(Boolean))].slice(0, 12);
  if (nomes.some((n) => n.length > 40)) throw new DomainError("Etiqueta com mais de 40 caracteres.");
  await tx(async (c) => {
    await c.query("UPDATE midias SET descricao = ?, texto_alternativo = ?, pasta_id = ? WHERE id = ?", [d.descricao, d.textoAlternativo, d.pastaId, id]);
    await c.query("DELETE FROM midia_etiqueta_rel WHERE midia_id = ?", [id]);
    for (const n of nomes) {
      await c.query("INSERT IGNORE INTO midia_etiquetas (nome) VALUES (?)", [n]);
      await c.query("INSERT IGNORE INTO midia_etiqueta_rel (midia_id, etiqueta_id) SELECT ?, id FROM midia_etiquetas WHERE nome = ?", [id, n]);
    }
  });
  await audit(actor, "midia.editar", { entidade: "midia", entidadeId: id });
}

export async function removerMidia(actor: number, id: number) {
  await assertCan(actor, "midia", "excluir");
  const m = await getMidia(actor, id);
  const usos = await query<RowDataPacket>(
    `SELECT COUNT(*) n FROM publicacao_midias pm JOIN publicacoes p ON p.id = pm.publicacao_id WHERE pm.midia_id = ? AND p.status NOT IN ('cancelado')`, [id]);
  if (Number(usos[0].n) > 0) throw new DomainError(`Esta mídia é usada em ${usos[0].n} publicação(ões). Remova-a delas antes de excluir.`);
  await execute("DELETE FROM publicacao_midias WHERE midia_id = ?", [id]); // só restam publicações canceladas
  await execute("UPDATE midias SET removido_em = UTC_TIMESTAMP() WHERE id = ?", [id]);
  await audit(actor, "midia.remover", { entidade: "midia", entidadeId: id, detalhes: { nome: m.nome_original } });
}

/** Remove de vez (arquivo e registro) o que está na lixeira há mais de `dias` dias. Usado pela rotina de manutenção. */
export async function purgarRemovidas(dias = 30): Promise<number> {
  const r = await query<RowDataPacket>("SELECT id, arquivo FROM midias WHERE removido_em IS NOT NULL AND removido_em < DATE_SUB(UTC_TIMESTAMP(), INTERVAL ? DAY) LIMIT 500", [dias]);
  for (const m of r) {
    try { await execute("DELETE FROM midias WHERE id = ?", [m.id]); await disco.remover(m.arquivo as string); } catch { /* ainda referenciada: tenta depois */ }
  }
  return r.length;
}

/* ---------- Pastas e etiquetas ---------- */
export type Pasta = { id: number; nome: string; parent_id: number | null; total: number };
export async function listarPastas(actor: number): Promise<Pasta[]> {
  await assertCan(actor, "midia", "ver");
  return query<Pasta & RowDataPacket>(
    `SELECT f.id, f.nome, f.parent_id, (SELECT COUNT(*) FROM midias m WHERE m.pasta_id = f.id AND m.removido_em IS NULL) AS total FROM midia_pastas f ORDER BY f.nome`);
}
export async function criarPasta(actor: number, nome: string, parentId: number | null) {
  await assertCan(actor, "midia", "criar");
  const n = nome.trim();
  if (n.length < 2 || n.length > 80) throw new DomainError("O nome da pasta deve ter de 2 a 80 caracteres.");
  if (parentId != null && !(await query<RowDataPacket>("SELECT 1 x FROM midia_pastas WHERE id = ?", [parentId]))[0]) throw new DomainError("Pasta superior inexistente.");
  const dup = await query<RowDataPacket>("SELECT 1 x FROM midia_pastas WHERE nome = ? AND parent_id <=> ?", [n, parentId]);
  if (dup.length) throw new DomainError("Já existe uma pasta com este nome aqui.");
  const r = await execute("INSERT INTO midia_pastas (nome, parent_id, criado_por) VALUES (?,?,?)", [n, parentId, actor]);
  await audit(actor, "pasta.criar", { entidade: "pasta", entidadeId: r.insertId });
  return r.insertId;
}
export async function excluirPasta(actor: number, id: number) {
  await assertCan(actor, "midia", "excluir");
  const filhos = await query<RowDataPacket>("SELECT (SELECT COUNT(*) FROM midia_pastas WHERE parent_id = ?) + (SELECT COUNT(*) FROM midias WHERE pasta_id = ? AND removido_em IS NULL) AS n", [id, id]);
  if (Number(filhos[0].n) > 0) throw new DomainError("A pasta não está vazia.");
  await execute("DELETE FROM midia_pastas WHERE id = ?", [id]);
  await audit(actor, "pasta.excluir", { entidade: "pasta", entidadeId: id });
}
export async function listarEtiquetas(actor: number) {
  await assertCan(actor, "midia", "ver");
  return query<RowDataPacket & { nome: string; total: number }>(
    `SELECT e.nome, COUNT(r.midia_id) AS total FROM midia_etiquetas e LEFT JOIN midia_etiqueta_rel r ON r.etiqueta_id = e.id GROUP BY e.id ORDER BY e.nome`);
}

/* ---------- URL pública temporária (para as APIs das redes buscarem a mídia) ---------- */
function segredoUrl(): string {
  const s = process.env.MEDIA_URL_SECRET || process.env.TOKEN_ENC_KEY || process.env.CRON_SECRET;
  if (!s || s.length < 24) throw new DomainError("Defina MEDIA_URL_SECRET (ou TOKEN_ENC_KEY) com ao menos 24 caracteres para publicar mídia.");
  return s;
}
const assinar = (id: number, exp: number) => createHmac("sha256", segredoUrl()).update(`midia:${id}:${exp}`).digest("base64url");

export function urlPublicaTemporaria(base: string, id: number, ttlSegundos = 1800, agora = Date.now()): string {
  const exp = Math.floor(agora / 1000) + ttlSegundos;
  return `${base.replace(/\/$/, "")}/api/midias/publica/${id}?exp=${exp}&sig=${assinar(id, exp)}`;
}
export function assinaturaValida(id: number, exp: number, sig: string, agora = Date.now()): boolean {
  if (!Number.isFinite(exp) || exp * 1000 < agora || !sig || sig.length > 100) return false;
  try {
    const esperado = Buffer.from(assinar(id, exp)), recebido = Buffer.from(sig);
    return esperado.length === recebido.length && timingSafeEqual(esperado, recebido);
  } catch { return false; }
}
export async function abrirPorAssinatura(id: number) {
  const m = (await query<Midia & RowDataPacket>("SELECT * FROM midias WHERE id = ? AND removido_em IS NULL", [id]))[0];
  if (!m || !(await disco.existe(m.arquivo))) throw new NotFoundError();
  return m;
}
