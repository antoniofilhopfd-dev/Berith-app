import type { RowDataPacket } from "mysql2/promise";
import { execute, query } from "@/lib/db";
import { accessibleUnitIds, assertCan, can } from "@/lib/permissions";
import { localToUtc } from "@/lib/time";
import type { z } from "zod";
import type { comunicadoSchema } from "@/lib/validation/eventos";
import { DomainError, NotFoundError } from "./errors";
import { audit } from "./audit";

export type Comunicado = {
  id: number; unit_id: number | null; unit_nome: string | null; titulo: string; corpo: string;
  prioridade: "normal" | "importante" | "urgente"; publicar_em: Date; expira_em: Date | null; criado_por: number;
  autor: string | null; lido_em: Date | null;
};

const SELECT = `SELECT a.*, o.nome AS unit_nome, u.nome AS autor, r.lido_em
  FROM announcements a LEFT JOIN org_units o ON o.id = a.unit_id LEFT JOIN users u ON u.id = a.criado_por
  LEFT JOIN announcement_reads r ON r.announcement_id = a.id AND r.user_id = ?`;
const ORDER = `ORDER BY FIELD(a.prioridade,'urgente','importante','normal'), a.publicar_em DESC`;
const VIVO = "a.publicar_em <= UTC_TIMESTAMP() AND (a.expira_em IS NULL OR a.expira_em > UTC_TIMESTAMP())";

/** Destinatários: comunidade inteira (unit_id NULL) ou integrantes ativos da estrutura (e quem a gerencia). */
export async function listForUser(actor: number, limit = 50): Promise<Comunicado[]> {
  const ids = await accessibleUnitIds(actor, "comunicados", "ver");
  const alvo = ids === "todas" ? "1=1" : ids.length ? "(a.unit_id IS NULL OR a.unit_id IN (?))" : "a.unit_id IS NULL";
  return query<Comunicado & RowDataPacket>(
    `${SELECT} WHERE ${VIVO} AND ${alvo} ${ORDER} LIMIT ?`,
    ids !== "todas" && ids.length ? [actor, ids, limit] : [actor, limit]);
}

async function canReach(actor: number, unitId: number | null) {
  return unitId == null || (await can(actor, "comunicados", "ver", unitId));
}

export async function getComunicado(actor: number, id: number): Promise<Comunicado> {
  const r = await query<Comunicado & RowDataPacket>(`${SELECT} WHERE a.id = ?`, [actor, id]);
  const a = r[0];
  if (!a || !(await canReach(actor, a.unit_id))) throw new NotFoundError();
  const gestor = await can(actor, "comunicados", "editar", a.unit_id);
  const vivo = a.publicar_em.getTime() <= Date.now() && (!a.expira_em || a.expira_em.getTime() > Date.now());
  if (!vivo && !gestor) throw new NotFoundError(); // agendados/expirados só para quem gerencia
  return a;
}

/** Visão de gestão: inclui agendados e expirados, apenas das estruturas que o usuário gerencia. */
export async function listManaged(actor: number): Promise<(Comunicado & { estado: string; lidos: number })[]> {
  const ids = await accessibleUnitIds(actor, "comunicados", "editar");
  const global = await can(actor, "comunicados", "editar", null);
  if (ids !== "todas" && ids.length === 0 && !global) return [];
  const alvo = ids === "todas" ? "1=1" : `(${global ? "a.unit_id IS NULL OR " : ""}a.unit_id IN (?))`;
  const rows = await query<Comunicado & RowDataPacket & { lidos: number }>(
    `${SELECT.replace("r.lido_em", "r.lido_em, (SELECT COUNT(*) FROM announcement_reads x WHERE x.announcement_id = a.id) AS lidos")}
     WHERE ${alvo} ORDER BY a.publicar_em DESC LIMIT 100`,
    ids === "todas" ? [actor] : [actor, ids.length ? ids : [0]]);
  const now = Date.now();
  return rows.map((a) => ({
    ...a, lidos: Number(a.lidos),
    estado: a.publicar_em.getTime() > now ? "agendado" : a.expira_em && a.expira_em.getTime() <= now ? "expirado" : "publicado",
  }));
}

export async function createComunicado(actor: number, d: z.infer<typeof comunicadoSchema>) {
  await assertCan(actor, "comunicados", "criar", d.unitId);
  if (d.unitId != null) {
    const u = await query<RowDataPacket>("SELECT ativo FROM org_units WHERE id = ?", [d.unitId]);
    if (!u[0]?.ativo) throw new DomainError("Estrutura inválida.");
  }
  const publicar = d.publicarData ? localToUtc(d.publicarData, d.publicarHora ?? "08:00") : new Date();
  const expira = d.expiraData ? localToUtc(d.expiraData, "23:59") : null;
  if (expira && expira.getTime() <= publicar.getTime()) throw new DomainError("A expiração deve ser depois da publicação.");
  const r = await execute(
    "INSERT INTO announcements (unit_id, titulo, corpo, prioridade, publicar_em, expira_em, criado_por) VALUES (?,?,?,?,?,?,?)",
    [d.unitId, d.titulo, d.corpo, d.prioridade, publicar, expira, actor]);
  await audit(actor, "comunicado.criar", { entidade: "announcement", entidadeId: r.insertId, detalhes: { unitId: d.unitId, prioridade: d.prioridade } });
  return r.insertId;
}

export async function deleteComunicado(actor: number, id: number) {
  const a = await getComunicado(actor, id);
  await assertCan(actor, "comunicados", "excluir", a.unit_id);
  await execute("DELETE FROM announcements WHERE id = ?", [id]);
  await audit(actor, "comunicado.excluir", { entidade: "announcement", entidadeId: id, detalhes: { titulo: a.titulo } });
}

export async function confirmRead(actor: number, id: number) {
  const a = await getComunicado(actor, id); // exige acesso e que esteja publicado
  if (a.publicar_em.getTime() > Date.now()) throw new NotFoundError();
  await execute("INSERT IGNORE INTO announcement_reads (announcement_id, user_id) VALUES (?, ?)", [id, actor]);
}

/** Totais para o gestor; nomes de quem leu/não leu só para quem edita. */
export async function readStats(actor: number, id: number) {
  const a = await getComunicado(actor, id);
  await assertCan(actor, "comunicados", "editar", a.unit_id);
  const destinatarios = a.unit_id == null
    ? await query<RowDataPacket>("SELECT id, nome FROM users WHERE status = 'ativo'")
    : await query<RowDataPacket>(
        `SELECT DISTINCT u.id, u.nome FROM users u JOIN memberships m ON m.user_id = u.id
         WHERE u.status = 'ativo' AND m.unit_id = ? AND m.inicio <= UTC_DATE() AND (m.fim IS NULL OR m.fim > UTC_DATE())`, [a.unit_id]);
  const leram = new Set((await query<RowDataPacket>("SELECT user_id FROM announcement_reads WHERE announcement_id = ?", [id])).map((r) => Number(r.user_id)));
  return {
    total: destinatarios.length, lidos: destinatarios.filter((d) => leram.has(Number(d.id))).length,
    pendentes: destinatarios.filter((d) => !leram.has(Number(d.id))).map((d) => d.nome as string),
  };
}

export async function unreadCount(actor: number) {
  const l = await listForUser(actor, 200);
  return l.filter((x) => !x.lido_em).length;
}

export const isScheduled = (a: { publicar_em: Date }) => a.publicar_em.getTime() > Date.now();
