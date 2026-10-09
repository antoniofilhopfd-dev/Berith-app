import { createHmac, timingSafeEqual } from "node:crypto";
import type { RowDataPacket } from "mysql2/promise";
import { execute, query, tx } from "@/lib/db";
import { assertCan } from "@/lib/permissions";

import { getEvent } from "./eventos";
import { occurrences, isOccurrence } from "./recorrencia";
import { DomainError, NotFoundError } from "./errors";
import { audit } from "./audit";

export type Linha = { user_id: number; nome: string; presente: number | null; confirmou: boolean };

async function occ(actor: number, eventId: number, date: string) {
  const ev = await getEvent(actor, eventId);
  if (ev.cancelado_em) throw new DomainError("Evento cancelado.");
  if (!isOccurrence(ev, date)) throw new DomainError("Data inválida para este evento.");
  const o = occurrences(ev, new Date(0), new Date("2100-01-01")).find((x) => x.date === date)!;
  return { ev, o };
}

/** Lista de chamada: integrantes da estrutura, quem confirmou e quem já tem registro. Só para quem registra presença. */
export async function sheet(actor: number, eventId: number, date: string): Promise<{ linhas: Linha[]; total: number; presentes: number }> {
  const { ev } = await occ(actor, eventId, date);
  await assertCan(actor, "presencas", "ver", ev.unit_id);
  const linhas = await query<Linha & RowDataPacket>(
    `SELECT u.id AS user_id, u.nome, a.presente, (r.status = 'confirmado') AS confirmou FROM users u
     LEFT JOIN attendance a ON a.event_id = ? AND a.occurrence_date = ? AND a.user_id = u.id
     LEFT JOIN event_rsvps r ON r.event_id = ? AND r.occurrence_date = ? AND r.user_id = u.id
     WHERE u.status = 'ativo' AND (a.user_id IS NOT NULL OR r.status = 'confirmado'
       ${ev.unit_id != null ? "OR EXISTS (SELECT 1 FROM memberships m WHERE m.user_id = u.id AND m.unit_id = ? AND m.inicio <= UTC_DATE() AND (m.fim IS NULL OR m.fim > UTC_DATE()))" : ""})
     ORDER BY u.nome`, ev.unit_id != null ? [eventId, date, eventId, date, ev.unit_id] : [eventId, date, eventId, date]);
  const norm = linhas.map((l) => ({ ...l, confirmou: Boolean(l.confirmou), presente: l.presente == null ? null : Number(l.presente) }));
  return { linhas: norm, total: norm.length, presentes: norm.filter((l) => l.presente === 1).length };
}

/**
 * Primeiro registro: permissão "criar". Alterar um registro existente: permissão "editar" + motivo,
 * gravado em attendance_corrections (auditoria). Não registra presença em data futura.
 */
export async function mark(actor: number, eventId: number, date: string, userId: number, presente: boolean, motivo: string | null) {
  const { ev, o } = await occ(actor, eventId, date);
  if (o.inicio.getTime() > Date.now() + 2 * 3600_000) throw new DomainError("A chamada só abre perto do horário do evento.");
  const u = await query<RowDataPacket>("SELECT status FROM users WHERE id = ?", [userId]);
  if (u[0]?.status !== "ativo") throw new DomainError("Pessoa não encontrada ou inativa.");
  const cur = await query<RowDataPacket>("SELECT presente FROM attendance WHERE event_id = ? AND occurrence_date = ? AND user_id = ?", [eventId, date, userId]);
  if (!cur[0]) {
    await assertCan(actor, "presencas", "criar", ev.unit_id);
    await execute("INSERT INTO attendance (event_id, occurrence_date, user_id, presente, registrado_por) VALUES (?,?,?,?,?)", [eventId, date, userId, presente ? 1 : 0, actor]);
    await audit(actor, "presenca.registrar", { entidade: "event", entidadeId: eventId, detalhes: { date, userId, presente } });
    return;
  }
  if (Boolean(cur[0].presente) === presente) return;
  await assertCan(actor, "presencas", "editar", ev.unit_id);
  if (!motivo || motivo.trim().length < 3) throw new DomainError("Informe o motivo da correção.");
  await tx(async (c) => {
    await c.query("UPDATE attendance SET presente = ?, registrado_por = ?, registrado_em = UTC_TIMESTAMP() WHERE event_id = ? AND occurrence_date = ? AND user_id = ?", [presente ? 1 : 0, actor, eventId, date, userId]);
    await c.query("INSERT INTO attendance_corrections (event_id, occurrence_date, user_id, antes, depois, motivo, corrigido_por) VALUES (?,?,?,?,?,?,?)",
      [eventId, date, userId, cur[0].presente, presente ? 1 : 0, motivo.trim().slice(0, 255), actor]);
  });
  await audit(actor, "presenca.corrigir", { entidade: "event", entidadeId: eventId, detalhes: { date, userId, presente, motivo } });
}

export async function addByEmail(actor: number, eventId: number, date: string, email: string) {
  const r = await query<RowDataPacket>("SELECT id FROM users WHERE email = ? AND status = 'ativo'", [email]);
  if (!r[0]) throw new DomainError("Pessoa não encontrada ou inativa.");
  await mark(actor, eventId, date, r[0].id, true, null);
}

export async function corrections(actor: number, eventId: number, date: string) {
  const { ev } = await occ(actor, eventId, date);
  await assertCan(actor, "presencas", "editar", ev.unit_id);
  return query<RowDataPacket & { nome: string; por: string; antes: number; depois: number; motivo: string; criado_em: Date }>(
    `SELECT u.nome, p.nome AS por, c.antes, c.depois, c.motivo, c.criado_em FROM attendance_corrections c
     JOIN users u ON u.id = c.user_id JOIN users p ON p.id = c.corrigido_por
     WHERE c.event_id = ? AND c.occurrence_date = ? ORDER BY c.id DESC`, [eventId, date]);
}

/** Histórico individual: cada pessoa vê somente a própria participação. */
export function myHistory(actor: number, limit = 30) {
  return query<RowDataPacket & { titulo: string; occurrence_date: string; presente: number; event_id: number }>(
    `SELECT e.titulo, a.occurrence_date, a.presente, a.event_id FROM attendance a JOIN events e ON e.id = a.event_id
     WHERE a.user_id = ? ORDER BY a.occurrence_date DESC LIMIT ?`, [actor, limit]);
}

/** Relatório agregado por evento (sem listar pessoas) para quem exporta presenças da estrutura. */
export async function report(actor: number, unitId: number, from: string, to: string) {
  await assertCan(actor, "presencas", "exportar", unitId);
  return query<RowDataPacket & { event_id: number; titulo: string; occurrence_date: string; presentes: number; registrados: number }>(
    `SELECT e.id AS event_id, e.titulo, a.occurrence_date, SUM(a.presente) AS presentes, COUNT(*) AS registrados
     FROM attendance a JOIN events e ON e.id = a.event_id WHERE e.unit_id = ? AND a.occurrence_date BETWEEN ? AND ?
     GROUP BY e.id, e.titulo, a.occurrence_date ORDER BY a.occurrence_date DESC`, [unitId, from, to]);
}

/* ---- QR Code: token assinado (HMAC) que vale só para uma ocorrência e por tempo limitado ---- */
function secret() {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) throw new Error("SESSION_SECRET ausente ou curto demais.");
  return s;
}
const sign = (p: string) => createHmac("sha256", secret()).update("checkin:" + p).digest("base64url");

export async function checkinToken(actor: number, eventId: number, date: string) {
  const { ev, o } = await occ(actor, eventId, date);
  await assertCan(actor, "presencas", "criar", ev.unit_id);
  const exp = Math.floor(((o.fim ?? o.inicio).getTime() + 4 * 3600_000) / 1000);
  const p = `${eventId}.${date}.${exp}`;
  return `${Buffer.from(p).toString("base64url")}.${sign(p)}`;
}

export async function checkin(actor: number, token: string) {
  const [b, sig] = token.split(".");
  if (!b || !sig || token.length > 300) throw new NotFoundError();
  const p = Buffer.from(b, "base64url").toString();
  const esperado = Buffer.from(sign(p)); const recebido = Buffer.from(sig);
  if (esperado.length !== recebido.length || !timingSafeEqual(esperado, recebido)) throw new NotFoundError();
  const [id, date, exp] = p.split(".");
  if (Number(exp) * 1000 < Date.now()) throw new DomainError("Este QR Code expirou.");
  const { ev, o } = await occ(actor, Number(id), date); // exige que o usuário enxergue o evento
  if (o.inicio.getTime() > Date.now() + 2 * 3600_000) throw new DomainError("A chamada ainda não abriu.");
  const r = await execute(
    "INSERT IGNORE INTO attendance (event_id, occurrence_date, user_id, presente, via, registrado_por) VALUES (?,?,?,1,'qr',?)", [ev.id, date, actor, actor]);
  await audit(actor, "presenca.qr", { entidade: "event", entidadeId: ev.id, detalhes: { date } });
  return { titulo: ev.titulo, date, jaRegistrado: r.affectedRows === 0 };
}
