import type { RowDataPacket } from "mysql2/promise";
import { execute, query, tx } from "@/lib/db";
import { accessibleUnitIds, assertCan, can } from "@/lib/permissions";
import { localToUtc, utcToLocal, brDate } from "@/lib/time";
import type { z } from "zod";
import type { escalaSchema } from "@/lib/validation/organizacao";
import { DomainError, NotFoundError } from "./errors";
import { audit } from "./audit";
import { destinatarios, notificar, notificarSeguro } from "./notificacoes";
import { celula as cell } from "@/lib/csv";

export type Escala = { id: number; unit_id: number; unit_nome: string; titulo: string; inicio: Date; fim: Date; observacao: string | null; cancelado_em: Date | null };
export type Atribuicao = { id: number; shift_id: number; user_id: number; nome: string; funcao: string | null; status: string; motivo: string | null };

const SEL = `SELECT s.*, o.nome AS unit_nome FROM shifts s JOIN org_units o ON o.id = s.unit_id`;

/** Estruturas em que o usuário enxerga escalas (integrantes, responsáveis e coordenações acima). */
export async function listShiftUnits(actor: number) {
  const ids = await accessibleUnitIds(actor, "escalas", "ver");
  if (ids !== "todas" && ids.length === 0) return [];
  return query<RowDataPacket & { id: number; nome: string; tipo: string }>(
    `SELECT id, nome, tipo FROM org_units WHERE ativo = 1 ${ids === "todas" ? "" : "AND id IN (?)"} ORDER BY tipo, nome`, ids === "todas" ? [] : [ids]);
}

export async function listUnitShifts(actor: number, unitId: number, from: Date, to: Date): Promise<Escala[]> {
  if (!(await can(actor, "escalas", "ver", unitId))) throw new NotFoundError();
  return query<Escala & RowDataPacket>(`${SEL} WHERE s.unit_id = ? AND s.fim >= ? AND s.inicio <= ? ORDER BY s.inicio`, [unitId, from, to]);
}

/** Escalas do próprio usuário (somente de estruturas em que ainda é integrante). */
export async function listMyAssignments(actor: number, from: Date, limit = 50) {
  return query<RowDataPacket & Escala & { assignment_id: number; funcao: string | null; status: string }>(
    `SELECT s.*, o.nome AS unit_nome, a.id AS assignment_id, a.funcao, a.status
     FROM shift_assignments a JOIN shifts s ON s.id = a.shift_id JOIN org_units o ON o.id = s.unit_id
     WHERE a.user_id = ? AND a.status IN ('pendente','confirmado') AND s.cancelado_em IS NULL AND s.fim >= ?
       AND EXISTS (SELECT 1 FROM memberships m WHERE m.user_id = a.user_id AND m.unit_id = s.unit_id AND m.inicio <= UTC_DATE() AND (m.fim IS NULL OR m.fim > UTC_DATE()))
     ORDER BY s.inicio LIMIT ?`, [actor, from, limit]);
}

export async function getShift(actor: number, id: number) {
  const r = await query<Escala & RowDataPacket>(`${SEL} WHERE s.id = ?`, [id]);
  if (!r[0] || !(await can(actor, "escalas", "ver", r[0].unit_id))) throw new NotFoundError();
  const atribuicoes = await query<Atribuicao & RowDataPacket>(
    `SELECT a.id, a.shift_id, a.user_id, u.nome, a.funcao, a.status, a.motivo FROM shift_assignments a JOIN users u ON u.id = a.user_id
     WHERE a.shift_id = ? ORDER BY FIELD(a.status,'confirmado','pendente','recusado','substituido'), u.nome`, [id]);
  return { escala: r[0], atribuicoes };
}

export async function createShift(actor: number, d: z.infer<typeof escalaSchema>) {
  await assertCan(actor, "escalas", "criar", d.unitId);
  const u = await query<RowDataPacket>("SELECT ativo FROM org_units WHERE id = ?", [d.unitId]);
  if (!u[0]?.ativo) throw new DomainError("Estrutura inválida.");
  const inicio = localToUtc(d.data, d.horaInicio), fim = localToUtc(d.data, d.horaFim);
  if (fim.getTime() <= inicio.getTime()) throw new DomainError("O término deve ser depois do início.");
  const r = await execute("INSERT INTO shifts (unit_id, titulo, inicio, fim, observacao, criado_por) VALUES (?,?,?,?,?,?)",
    [d.unitId, d.titulo, inicio, fim, d.observacao, actor]);
  await audit(actor, "escala.criar", { entidade: "shift", entidadeId: r.insertId });
  return r.insertId;
}

export async function cancelShift(actor: number, id: number) {
  const { escala } = await getShift(actor, id);
  await assertCan(actor, "escalas", "excluir", escala.unit_id);
  await execute("UPDATE shifts SET cancelado_em = UTC_TIMESTAMP() WHERE id = ? AND cancelado_em IS NULL", [id]);
  await audit(actor, "escala.cancelar", { entidade: "shift", entidadeId: id });
}

/** Detecta sobreposição com outras escalas ativas da pessoa e indisponibilidades informadas. */
export async function findConflicts(userId: number, inicio: Date, fim: Date, ignoreShiftId?: number) {
  const sobrepostas = await query<RowDataPacket>(
    `SELECT s.titulo, s.inicio FROM shift_assignments a JOIN shifts s ON s.id = a.shift_id
     WHERE a.user_id = ? AND a.status IN ('pendente','confirmado') AND s.cancelado_em IS NULL AND s.id <> ? AND s.inicio < ? AND s.fim > ?`,
    [userId, ignoreShiftId ?? 0, fim, inicio]);
  const d1 = utcToLocal(inicio).date, d2 = utcToLocal(new Date(fim.getTime() - 1)).date;
  const indisp = await query<RowDataPacket>("SELECT data, nota FROM user_unavailability WHERE user_id = ? AND data BETWEEN ? AND ?", [userId, d1, d2]);
  return { sobrepostas, indisp };
}

async function checkAssignable(unitId: number, userId: number, inicio: Date, fim: Date, shiftId: number, forcar: boolean) {
  const u = await query<RowDataPacket>("SELECT status FROM users WHERE id = ?", [userId]);
  if (u[0]?.status !== "ativo") throw new DomainError("Pessoa não encontrada ou inativa.");
  const m = await query<RowDataPacket>(
    "SELECT 1 x FROM memberships WHERE user_id = ? AND unit_id = ? AND inicio <= UTC_DATE() AND (fim IS NULL OR fim > UTC_DATE()) LIMIT 1", [userId, unitId]);
  if (!m.length) throw new DomainError("A pessoa não é integrante desta estrutura.");
  const c = await findConflicts(userId, inicio, fim, shiftId);
  if (c.sobrepostas.length) throw new DomainError(`Conflito de horário com "${c.sobrepostas[0].titulo}".`);
  if (c.indisp.length && !forcar) {
    const dia = typeof c.indisp[0].data === "string" ? c.indisp[0].data : String(c.indisp[0].data);
    throw new DomainError(`A pessoa informou indisponibilidade em ${brDate(dia.slice(0, 10))}. Marque "escalar mesmo assim" para confirmar.`);
  }
}

async function userByEmail(email: string) {
  const r = await query<RowDataPacket>("SELECT id FROM users WHERE email = ? AND status = 'ativo'", [email]);
  if (!r[0]) throw new DomainError("Pessoa não encontrada ou inativa.");
  return r[0].id as number;
}

export async function assign(actor: number, shiftId: number, email: string, funcao: string | null, forcar: boolean) {
  const { escala } = await getShift(actor, shiftId);
  await assertCan(actor, "escalas", "editar", escala.unit_id);
  if (escala.cancelado_em) throw new DomainError("Escala cancelada.");
  const userId = await userByEmail(email);
  await checkAssignable(escala.unit_id, userId, escala.inicio, escala.fim, shiftId, forcar);
  const ja = await query<RowDataPacket>("SELECT id, status FROM shift_assignments WHERE shift_id = ? AND user_id = ?", [shiftId, userId]);
  if (ja[0] && ja[0].status !== "recusado" && ja[0].status !== "substituido") throw new DomainError("A pessoa já está nesta escala.");
  if (ja[0]) await execute("UPDATE shift_assignments SET status='pendente', funcao=?, motivo=NULL WHERE id = ?", [funcao, ja[0].id]);
  else await execute("INSERT INTO shift_assignments (shift_id, user_id, funcao) VALUES (?,?,?)", [shiftId, userId, funcao]);
  await audit(actor, "escala.escalar", { entidade: "shift", entidadeId: shiftId, detalhes: { userId, funcao } });
  await notificarSeguro(() => notificar([userId], { tipo: "escala", titulo: "Você foi escalado(a)", corpo: escala.titulo, url: `/escalas/${shiftId}`, dedupeKey: `escala:${shiftId}:${userId}:${Date.now()}` }));
}

export async function respond(actor: number, assignmentId: number, status: "confirmado" | "recusado", motivo: string | null) {
  const r = await query<RowDataPacket>(
    `SELECT a.id, a.user_id, a.status, s.fim, s.cancelado_em FROM shift_assignments a JOIN shifts s ON s.id = a.shift_id WHERE a.id = ?`, [assignmentId]);
  if (!r[0] || r[0].user_id !== actor) throw new NotFoundError(); // só a própria escala
  if (r[0].cancelado_em) throw new DomainError("Escala cancelada.");
  if (!["pendente", "confirmado"].includes(r[0].status)) throw new DomainError("Esta escalação não está mais ativa.");
  if (new Date(r[0].fim).getTime() < Date.now()) throw new DomainError("Esta escala já passou.");
  await execute("UPDATE shift_assignments SET status = ?, motivo = ? WHERE id = ?", [status, status === "recusado" ? motivo : null, assignmentId]);
  await audit(actor, `escala.${status}`, { entidade: "shift_assignment", entidadeId: assignmentId });
}

/** Substituição: marca a escalação original como substituída e escala outra pessoa, em transação. */
export async function substitute(actor: number, assignmentId: number, email: string, forcar: boolean) {
  const a = await query<RowDataPacket>("SELECT shift_id, user_id, funcao, status FROM shift_assignments WHERE id = ?", [assignmentId]);
  if (!a[0]) throw new NotFoundError();
  const { escala } = await getShift(actor, a[0].shift_id);
  await assertCan(actor, "escalas", "editar", escala.unit_id);
  if (escala.cancelado_em) throw new DomainError("Escala cancelada.");
  if (a[0].status === "substituido") throw new DomainError("Já foi substituída.");
  const novo = await userByEmail(email);
  if (novo === a[0].user_id) throw new DomainError("Escolha outra pessoa.");
  await checkAssignable(escala.unit_id, novo, escala.inicio, escala.fim, escala.id, forcar);
  await tx(async (c) => {
    await c.query("UPDATE shift_assignments SET status = 'substituido' WHERE id = ?", [assignmentId]);
    await c.query(
      `INSERT INTO shift_assignments (shift_id, user_id, funcao, substitui_id) VALUES (?,?,?,?)
       ON DUPLICATE KEY UPDATE status='pendente', funcao=VALUES(funcao), substitui_id=VALUES(substitui_id), motivo=NULL`,
      [escala.id, novo, a[0].funcao, assignmentId]);
  });
  await audit(actor, "escala.substituir", { entidade: "shift_assignment", entidadeId: assignmentId, detalhes: { novo } });
  await notificarSeguro(() => notificar([novo], { tipo: "escala", titulo: "Você foi escalado(a) (substituição)", corpo: escala.titulo, url: `/escalas/${escala.id}`, dedupeKey: `escala:${escala.id}:${novo}:${Date.now()}` }));
}

export async function unassign(actor: number, assignmentId: number) {
  const a = await query<RowDataPacket>("SELECT shift_id, user_id FROM shift_assignments WHERE id = ?", [assignmentId]);
  if (!a[0]) throw new NotFoundError();
  const { escala } = await getShift(actor, a[0].shift_id);
  await assertCan(actor, "escalas", "editar", escala.unit_id);
  await execute("DELETE FROM shift_assignments WHERE id = ?", [assignmentId]);
  await audit(actor, "escala.remover", { entidade: "shift", entidadeId: escala.id, detalhes: { userId: a[0].user_id } });
}

/* Disponibilidade: cada pessoa gerencia apenas a própria. */
export async function setUnavailable(actor: number, date: string, nota: string | null) {
  await execute("INSERT INTO user_unavailability (user_id, data, nota) VALUES (?,?,?) ON DUPLICATE KEY UPDATE nota = VALUES(nota)", [actor, date, nota]);
}
export async function clearUnavailable(actor: number, date: string) {
  await execute("DELETE FROM user_unavailability WHERE user_id = ? AND data = ?", [actor, date]);
}
export const myUnavailability = (actor: number) =>
  query<RowDataPacket & { data: string; nota: string | null }>("SELECT data, nota FROM user_unavailability WHERE user_id = ? AND data >= UTC_DATE() ORDER BY data", [actor]);

export async function exportCsv(actor: number, unitId: number, from: Date, to: Date) {
  await assertCan(actor, "escalas", "exportar", unitId);
  const rows = await query<RowDataPacket>(
    `SELECT s.titulo, s.inicio, s.fim, u.nome, a.funcao, a.status FROM shifts s
     LEFT JOIN shift_assignments a ON a.shift_id = s.id AND a.status <> 'substituido' LEFT JOIN users u ON u.id = a.user_id
     WHERE s.unit_id = ? AND s.cancelado_em IS NULL AND s.inicio >= ? AND s.inicio <= ? ORDER BY s.inicio, u.nome`, [unitId, from, to]);
  await audit(actor, "escala.exportar", { entidade: "org_unit", entidadeId: unitId });
  const f = (d: Date) => { const l = utcToLocal(d); return `${brDate(l.date)} ${l.time}`; };
  return "﻿" + ["Escala;Início;Término;Pessoa;Função;Situação", ...rows.map((r) =>
    [cell(r.titulo), cell(f(r.inicio)), cell(f(r.fim)), cell(r.nome), cell(r.funcao), cell(r.status)].join(";"))].join("\r\n");
}

export const isPast = (e: { fim: Date }) => e.fim.getTime() < Date.now();
