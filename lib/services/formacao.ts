import type { RowDataPacket } from "mysql2/promise";
import { execute, query, tx } from "@/lib/db";
import { accessibleUnitIds, assertCan, can } from "@/lib/permissions";
import type { z } from "zod";
import type { conteudoSchema, trilhaSchema } from "@/lib/validation/formacao";
import { DomainError, NotFoundError } from "./errors";
import { audit } from "./audit";

export type Conteudo = {
  id: number; unit_id: number | null; unit_nome: string | null; categoria: string; titulo: string; resumo: string | null; corpo: string | null;
  fonte_nome: string; fonte_url: string | null; direitos: string | null; publicado: number; criado_em: Date; favorito: number; concluido: number;
};
const SEL = `SELECT c.*, o.nome AS unit_nome, (f.user_id IS NOT NULL) AS favorito, (k.user_id IS NOT NULL) AS concluido
  FROM conteudos c LEFT JOIN org_units o ON o.id = c.unit_id
  LEFT JOIN conteudo_favoritos f ON f.conteudo_id = c.id AND f.user_id = ?
  LEFT JOIN conteudo_concluidos k ON k.conteudo_id = c.id AND k.user_id = ?`;

/** Visíveis: abertos à comunidade (unit_id NULL) ou de estruturas em que o usuário tem acesso; rascunhos só para quem edita. */
async function clausulaVisivel(actor: number) {
  const ver = await accessibleUnitIds(actor, "conteudos", "ver");
  const edit = await accessibleUnitIds(actor, "conteudos", "editar");
  const editaGlobal = await can(actor, "conteudos", "editar", null);
  const alvo = ver === "todas" ? "1=1" : ver.length ? "(c.unit_id IS NULL OR c.unit_id IN (?))" : "c.unit_id IS NULL";
  const pub = edit === "todas" || editaGlobal ? "1=1" : edit.length ? `(c.publicado = 1 OR c.unit_id IN (?))` : "c.publicado = 1";
  const params: unknown[] = [];
  if (ver !== "todas" && ver.length) params.push(ver);
  if (!(edit === "todas" || editaGlobal) && edit.length) params.push(edit);
  return { sql: `${alvo} AND ${pub}`, params };
}

const like = (q: string) => `%${q.replace(/[\\%_]/g, "\\$&")}%`;

export async function listarConteudos(actor: number, o: { categoria?: string; q?: string; favoritos?: boolean; page?: number } = {}) {
  const v = await clausulaVisivel(actor);
  const where = [v.sql]; const ps: unknown[] = [...v.params];
  if (o.categoria) { where.push("c.categoria = ?"); ps.push(o.categoria); }
  if (o.q) { where.push("(c.titulo LIKE ? OR c.resumo LIKE ? OR c.corpo LIKE ?)"); ps.push(like(o.q), like(o.q), like(o.q)); }
  if (o.favoritos) where.push("f.user_id IS NOT NULL");
  const page = Math.max(1, o.page ?? 1); const size = 20;
  const base = `${SEL} WHERE ${where.join(" AND ")}`;
  const itens = await query<Conteudo & RowDataPacket>(`${base} ORDER BY c.criado_em DESC, c.id DESC LIMIT ? OFFSET ?`, [actor, actor, ...ps, size, (page - 1) * size]);
  const total = await query<RowDataPacket>(`SELECT COUNT(*) n FROM conteudos c LEFT JOIN conteudo_favoritos f ON f.conteudo_id = c.id AND f.user_id = ? WHERE ${where.join(" AND ")}`, [actor, ...ps]);
  return { itens, total: Number(total[0].n), size };
}

export async function getConteudo(actor: number, id: number): Promise<Conteudo> {
  const r = await query<Conteudo & RowDataPacket>(`${SEL} WHERE c.id = ?`, [actor, actor, id]);
  const c = r[0];
  if (!c) throw new NotFoundError();
  if (c.unit_id != null && !(await can(actor, "conteudos", "ver", c.unit_id))) throw new NotFoundError(); // exclusivo da estrutura
  if (!c.publicado && !(await can(actor, "conteudos", "editar", c.unit_id))) throw new NotFoundError();
  return c;
}

export async function criarConteudo(actor: number, d: z.infer<typeof conteudoSchema>) {
  await assertCan(actor, "conteudos", "criar", d.unitId);
  if (d.unitId != null) {
    const u = await query<RowDataPacket>("SELECT ativo FROM org_units WHERE id = ?", [d.unitId]);
    if (!u[0]?.ativo) throw new DomainError("Estrutura inválida.");
  }
  const r = await execute(
    "INSERT INTO conteudos (unit_id, categoria, titulo, resumo, corpo, fonte_nome, fonte_url, direitos, publicado, criado_por) VALUES (?,?,?,?,?,?,?,?,?,?)",
    [d.unitId, d.categoria, d.titulo, d.resumo, d.corpo, d.fonteNome, d.fonteUrl ?? null, d.direitos, d.publicado ? 1 : 0, actor]);
  await audit(actor, "conteudo.criar", { entidade: "conteudo", entidadeId: r.insertId, detalhes: { fonte: d.fonteNome, unitId: d.unitId } });
  return r.insertId;
}

export async function editarConteudo(actor: number, id: number, d: z.infer<typeof conteudoSchema>) {
  const c = await getConteudo(actor, id);
  await assertCan(actor, "conteudos", "editar", c.unit_id);
  await execute("UPDATE conteudos SET categoria=?, titulo=?, resumo=?, corpo=?, fonte_nome=?, fonte_url=?, direitos=?, publicado=? WHERE id=?",
    [d.categoria, d.titulo, d.resumo, d.corpo, d.fonteNome, d.fonteUrl ?? null, d.direitos, d.publicado ? 1 : 0, id]);
  await audit(actor, "conteudo.editar", { entidade: "conteudo", entidadeId: id });
}

export async function excluirConteudo(actor: number, id: number) {
  const c = await getConteudo(actor, id);
  await assertCan(actor, "conteudos", "excluir", c.unit_id);
  await execute("DELETE FROM conteudos WHERE id = ?", [id]);
  await audit(actor, "conteudo.excluir", { entidade: "conteudo", entidadeId: id, detalhes: { titulo: c.titulo } });
}

export async function alternarFavorito(actor: number, id: number) {
  const c = await getConteudo(actor, id);
  if (c.favorito) await execute("DELETE FROM conteudo_favoritos WHERE user_id = ? AND conteudo_id = ?", [actor, id]);
  else await execute("INSERT IGNORE INTO conteudo_favoritos (user_id, conteudo_id) VALUES (?, ?)", [actor, id]);
  return !c.favorito;
}

export async function alternarConcluido(actor: number, id: number) {
  const c = await getConteudo(actor, id);
  if (c.concluido) await execute("DELETE FROM conteudo_concluidos WHERE user_id = ? AND conteudo_id = ?", [actor, id]);
  else await execute("INSERT IGNORE INTO conteudo_concluidos (user_id, conteudo_id) VALUES (?, ?)", [actor, id]);
  return !c.concluido;
}

/* ---- Trilhas formativas ---- */
export type Trilha = { id: number; unit_id: number | null; unit_nome: string | null; titulo: string; descricao: string | null; total: number; feitos: number };

export async function listarTrilhas(actor: number): Promise<Trilha[]> {
  const ver = await accessibleUnitIds(actor, "conteudos", "ver");
  const alvo = ver === "todas" ? "1=1" : ver.length ? "(t.unit_id IS NULL OR t.unit_id IN (?))" : "t.unit_id IS NULL";
  return query<Trilha & RowDataPacket>(
    `SELECT t.id, t.unit_id, o.nome AS unit_nome, t.titulo, t.descricao,
       (SELECT COUNT(*) FROM trilha_itens i JOIN conteudos c ON c.id = i.conteudo_id WHERE i.trilha_id = t.id AND c.publicado = 1) AS total,
       (SELECT COUNT(*) FROM trilha_itens i JOIN conteudo_concluidos k ON k.conteudo_id = i.conteudo_id AND k.user_id = ? WHERE i.trilha_id = t.id) AS feitos
     FROM trilhas t LEFT JOIN org_units o ON o.id = t.unit_id WHERE ${alvo} ORDER BY t.titulo`,
    ver !== "todas" && ver.length ? [actor, ver] : [actor]);
}

export async function getTrilha(actor: number, id: number) {
  const r = await query<RowDataPacket>("SELECT t.*, o.nome AS unit_nome FROM trilhas t LEFT JOIN org_units o ON o.id = t.unit_id WHERE t.id = ?", [id]);
  const t = r[0];
  if (!t || (t.unit_id != null && !(await can(actor, "conteudos", "ver", t.unit_id)))) throw new NotFoundError();
  // Itens: apenas conteúdos que o usuário pode ver (a trilha nunca expõe conteúdo de outra estrutura).
  const itens = (await Promise.all((await query<RowDataPacket>("SELECT conteudo_id, ordem FROM trilha_itens WHERE trilha_id = ? ORDER BY ordem", [id]))
    .map(async (i) => { try { return await getConteudo(actor, i.conteudo_id as number); } catch { return null; } }))).filter((c): c is Conteudo => c !== null && c.publicado === 1);
  return { trilha: t as RowDataPacket & { id: number; titulo: string; descricao: string | null; unit_id: number | null; unit_nome: string | null }, itens };
}

export async function criarTrilha(actor: number, d: z.infer<typeof trilhaSchema>, conteudoIds: number[]) {
  await assertCan(actor, "conteudos", "criar", d.unitId);
  const ids = [...new Set(conteudoIds)].slice(0, 50);
  const id = await tx(async (c) => {
    const [r] = await c.query<import("mysql2/promise").ResultSetHeader>("INSERT INTO trilhas (unit_id, titulo, descricao, criado_por) VALUES (?,?,?,?)", [d.unitId, d.titulo, d.descricao, actor]);
    let ordem = 1;
    for (const cid of ids) {
      const [ok] = await c.query<RowDataPacket[]>("SELECT unit_id FROM conteudos WHERE id = ?", [cid]);
      if (!ok[0]) throw new DomainError("Conteúdo inexistente na trilha.");
      // O conteúdo precisa ser da mesma abrangência da trilha (ou aberto à comunidade): evita vazamento entre estruturas.
      if (ok[0].unit_id != null && ok[0].unit_id !== d.unitId) throw new DomainError("A trilha só pode incluir conteúdos da mesma estrutura ou abertos à comunidade.");
      await c.query("INSERT INTO trilha_itens (trilha_id, conteudo_id, ordem) VALUES (?,?,?)", [r.insertId, cid, ordem++]);
    }
    return r.insertId;
  });
  await audit(actor, "trilha.criar", { entidade: "trilha", entidadeId: id });
  return id;
}

export async function excluirTrilha(actor: number, id: number) {
  const { trilha } = await getTrilha(actor, id);
  await assertCan(actor, "conteudos", "excluir", trilha.unit_id);
  await execute("DELETE FROM trilhas WHERE id = ?", [id]);
  await audit(actor, "trilha.excluir", { entidade: "trilha", entidadeId: id });
}

export const podeCriarConteudo = (actor: number, unitId: number | null) => can(actor, "conteudos", "criar", unitId);
