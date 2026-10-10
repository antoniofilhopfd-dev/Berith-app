import type { RowDataPacket } from "mysql2/promise";
import { execute, query, tx } from "@/lib/db";
import { accessibleUnitIds, assertCan, can } from "@/lib/permissions";
import { localToUtc, addDays, utcToLocal, todayLocal } from "@/lib/time";
import type { EventoInput } from "@/lib/validation/eventos";
import { occurrences, isOccurrence, type Occurrence } from "./recorrencia";
import { DomainError, NotFoundError } from "./errors";
import { audit } from "./audit";
import { destinatarios, notificar, notificarSeguro } from "./notificacoes";

export type Evento = {
  id: number; unit_id: number | null; unit_nome: string | null; titulo: string; descricao: string | null; local: string | null;
  inicio: Date; fim: Date | null; responsavel_id: number | null; responsavel_nome: string | null; limite_participantes: number | null;
  lembrete_min: number | null; recorrencia: "nenhuma" | "semanal" | "mensal"; recorrencia_ate: string | null;
  cancelado_em: Date | null; cancelado_motivo: string | null; criado_por: number;
};
export type Ocorrencia = Occurrence & { evento: Evento; cancelada: boolean; confirmados: number; meuStatus: string | null };

const BASE_SELECT = `SELECT e.*, o.nome AS unit_nome, r.nome AS responsavel_nome
  FROM events e LEFT JOIN org_units o ON o.id = e.unit_id LEFT JOIN users r ON r.id = e.responsavel_id`;

/** Eventos visíveis: abertos à comunidade (unit_id NULL) ou de estruturas onde o usuário tem acesso de visualização. */
async function visibilityClause(actor: number): Promise<{ sql: string; params: unknown[] }> {
  const ids = await accessibleUnitIds(actor, "eventos", "ver");
  if (ids === "todas") return { sql: "1=1", params: [] };
  if (ids.length === 0) return { sql: "e.unit_id IS NULL", params: [] };
  return { sql: "(e.unit_id IS NULL OR e.unit_id IN (?))", params: [ids] };
}

export async function canSeeEvent(actor: number, unitId: number | null) {
  return unitId == null ? true : can(actor, "eventos", "ver", unitId);
}

export async function listOccurrences(actor: number, from: Date, to: Date, max = 300): Promise<Ocorrencia[]> {
  if (to.getTime() - from.getTime() > 100 * 86400_000) throw new DomainError("Período muito longo.");
  const vis = await visibilityClause(actor);
  const evs = await query<Evento & RowDataPacket>(
    `${BASE_SELECT} WHERE ${vis.sql} AND e.inicio <= ?
       AND (e.recorrencia <> 'nenhuma' AND (e.recorrencia_ate IS NULL OR e.recorrencia_ate >= ?)
            OR e.recorrencia = 'nenhuma' AND COALESCE(e.fim, e.inicio) >= ?)`,
    [...vis.params, to, from.toISOString().slice(0, 10), from]);
  if (evs.length === 0) return [];
  const ids = evs.map((e) => e.id);
  const [exc, conf, mine] = await Promise.all([
    query<RowDataPacket>("SELECT event_id, occurrence_date FROM event_exceptions WHERE event_id IN (?)", [ids]),
    query<RowDataPacket>("SELECT event_id, occurrence_date, COUNT(*) n FROM event_rsvps WHERE status='confirmado' AND event_id IN (?) GROUP BY event_id, occurrence_date", [ids]),
    query<RowDataPacket>("SELECT event_id, occurrence_date, status FROM event_rsvps WHERE user_id = ? AND event_id IN (?)", [actor, ids]),
  ]);
  const key = (id: number, d: string) => `${id}|${d}`;
  const excS = new Set(exc.map((x) => key(x.event_id, x.occurrence_date)));
  const confM = new Map(conf.map((x) => [key(x.event_id, x.occurrence_date), Number(x.n)]));
  const mineM = new Map(mine.map((x) => [key(x.event_id, x.occurrence_date), x.status as string]));
  const out: Ocorrencia[] = [];
  for (const ev of evs) {
    for (const o of occurrences(ev, from, to)) {
      out.push({
        ...o, evento: ev, cancelada: Boolean(ev.cancelado_em) || excS.has(key(ev.id, o.date)),
        confirmados: confM.get(key(ev.id, o.date)) ?? 0, meuStatus: mineM.get(key(ev.id, o.date)) ?? null,
      });
    }
  }
  out.sort((a, b) => a.inicio.getTime() - b.inicio.getTime() || a.evento.id - b.evento.id);
  return out.slice(0, max);
}

export async function getEvent(actor: number, id: number): Promise<Evento> {
  const r = await query<Evento & RowDataPacket>(`${BASE_SELECT} WHERE e.id = ?`, [id]);
  if (!r[0] || !(await canSeeEvent(actor, r[0].unit_id))) throw new NotFoundError(); // não revela existência
  return r[0];
}

export async function canManageEvent(actor: number, unitId: number | null, acao: "criar" | "editar" | "excluir" = "editar") {
  return can(actor, "eventos", acao, unitId);
}

/** Quais estruturas o usuário pode usar para criar eventos (e se pode criar para toda a comunidade). */
export async function creationTargets(actor: number) {
  const todas = await can(actor, "eventos", "criar", null);
  const ids = await accessibleUnitIds(actor, "eventos", "criar");
  return { comunidade: todas, unidades: ids };
}

function validarHorarios(d: EventoInput) {
  const inicio = localToUtc(d.data, d.horaInicio);
  let fim: Date | null = null;
  if (d.horaFim) {
    fim = localToUtc(d.dataFim ?? d.data, d.horaFim);
    if (fim.getTime() <= inicio.getTime()) throw new DomainError("O término deve ser depois do início.");
    if (fim.getTime() - inicio.getTime() > 14 * 86400_000) throw new DomainError("Duração máxima de 14 dias.");
  }
  if (d.recorrencia !== "nenhuma") {
    if (!d.recorrenciaAte) throw new DomainError("Informe até quando o evento se repete.");
    if (d.recorrenciaAte < d.data) throw new DomainError("A repetição termina antes do início.");
    if (d.recorrenciaAte > addDays(d.data, 366 * 2)) throw new DomainError("A repetição pode durar no máximo 2 anos.");
  }
  return { inicio, fim };
}

async function resolveResponsavel(actor: number, email: string | undefined) {
  if (!email) return actor;
  const r = await query<RowDataPacket>("SELECT id FROM users WHERE email = ? AND status = 'ativo'", [email]);
  if (!r[0]) throw new DomainError("Responsável não encontrado.");
  return r[0].id as number;
}

async function log(eventId: number, user: number, acao: string, detalhes?: unknown) {
  await execute("INSERT INTO event_history (event_id, user_id, acao, detalhes) VALUES (?, ?, ?, ?)",
    [eventId, user, acao, detalhes === undefined ? null : JSON.stringify(detalhes)]);
}

export async function createEvent(actor: number, d: EventoInput) {
  await assertCan(actor, "eventos", "criar", d.unitId); // sem estrutura: somente papel global
  if (d.unitId != null) {
    const u = await query<RowDataPacket>("SELECT ativo FROM org_units WHERE id = ?", [d.unitId]);
    if (!u[0]?.ativo) throw new DomainError("Estrutura inválida.");
  }
  const { inicio, fim } = validarHorarios(d);
  const resp = await resolveResponsavel(actor, d.responsavelEmail);
  const r = await execute(
    `INSERT INTO events (unit_id, titulo, descricao, local, inicio, fim, responsavel_id, limite_participantes, lembrete_min, recorrencia, recorrencia_ate, criado_por)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
    [d.unitId, d.titulo, d.descricao, d.local, inicio, fim, resp, d.limite, d.lembreteMin, d.recorrencia, d.recorrencia === "nenhuma" ? null : d.recorrenciaAte, actor]);
  await log(r.insertId, actor, "criado");
  await audit(actor, "evento.criar", { entidade: "event", entidadeId: r.insertId });
  await notificarSeguro(async () => notificar(await destinatarios(d.unitId, [actor]), { tipo: "evento", titulo: "Novo evento", corpo: d.titulo, url: `/eventos/${r.insertId}`, dedupeKey: `evento:novo:${r.insertId}` }));
  return r.insertId;
}

export async function updateEvent(actor: number, id: number, d: EventoInput) {
  const ev = await getEvent(actor, id);
  await assertCan(actor, "eventos", "editar", ev.unit_id);
  if (ev.cancelado_em) throw new DomainError("Evento cancelado não pode ser editado.");
  const { inicio, fim } = validarHorarios(d);
  const resp = await resolveResponsavel(actor, d.responsavelEmail ?? undefined) ;
  if (d.limite != null) {
    const max = await query<RowDataPacket>("SELECT COALESCE(MAX(n),0) m FROM (SELECT COUNT(*) n FROM event_rsvps WHERE event_id = ? AND status='confirmado' GROUP BY occurrence_date) t", [id]);
    if (Number(max[0].m) > d.limite) throw new DomainError(`Já há ${max[0].m} confirmações; o limite não pode ser menor.`);
  }
  const antes = { titulo: ev.titulo, local: ev.local, inicio: ev.inicio, fim: ev.fim, limite: ev.limite_participantes, recorrencia: ev.recorrencia };
  await execute(
    `UPDATE events SET titulo=?, descricao=?, local=?, inicio=?, fim=?, responsavel_id=?, limite_participantes=?, lembrete_min=?, recorrencia=?, recorrencia_ate=? WHERE id=?`,
    [d.titulo, d.descricao, d.local, inicio, fim, d.responsavelEmail ? resp : ev.responsavel_id, d.limite, d.lembreteMin, d.recorrencia, d.recorrencia === "nenhuma" ? null : d.recorrenciaAte, id]);
  await log(id, actor, "editado", { antes, depois: { titulo: d.titulo, local: d.local, inicio, fim, limite: d.limite, recorrencia: d.recorrencia } });
  await audit(actor, "evento.editar", { entidade: "event", entidadeId: id });
}

export async function cancelEvent(actor: number, id: number, motivo: string | null) {
  const ev = await getEvent(actor, id);
  await assertCan(actor, "eventos", "excluir", ev.unit_id);
  await execute("UPDATE events SET cancelado_em = UTC_TIMESTAMP(), cancelado_motivo = ? WHERE id = ? AND cancelado_em IS NULL", [motivo, id]);
  await log(id, actor, "cancelado", { motivo });
  await audit(actor, "evento.cancelar", { entidade: "event", entidadeId: id });
  await notificarSeguro(async () => notificar(await destinatarios(ev.unit_id, [actor]), { tipo: "evento", titulo: "Evento cancelado", corpo: ev.titulo, url: `/eventos/${id}`, dedupeKey: `evento:cancelado:${id}` }));
}

export async function cancelOccurrence(actor: number, id: number, date: string, motivo: string | null) {
  const ev = await getEvent(actor, id);
  await assertCan(actor, "eventos", "excluir", ev.unit_id);
  if (!isOccurrence(ev, date)) throw new DomainError("Data não corresponde a uma ocorrência do evento.");
  await execute("INSERT IGNORE INTO event_exceptions (event_id, occurrence_date, motivo) VALUES (?, ?, ?)", [id, date, motivo]);
  await log(id, actor, "ocorrencia_cancelada", { date, motivo });
  await audit(actor, "evento.cancelar_ocorrencia", { entidade: "event", entidadeId: id, detalhes: { date } });
}

export async function rsvp(actor: number, eventId: number, date: string, status: "confirmado" | "talvez" | "nao_vai") {
  const ev = await getEvent(actor, eventId);
  if (ev.cancelado_em) throw new DomainError("Evento cancelado.");
  if (!isOccurrence(ev, date)) throw new DomainError("Data inválida para este evento.");
  const exc = await query<RowDataPacket>("SELECT 1 x FROM event_exceptions WHERE event_id = ? AND occurrence_date = ?", [eventId, date]);
  if (exc.length) throw new DomainError("Esta data foi cancelada.");
  const occ = occurrences(ev, new Date(0), new Date("2100-01-01")).find((o) => o.date === date);
  if (occ && (occ.fim ?? occ.inicio).getTime() < Date.now() ) throw new DomainError("Este evento já aconteceu.");
  await tx(async (c) => {
    await c.query("SELECT id FROM events WHERE id = ? FOR UPDATE", [eventId]); // serializa a contagem de vagas
    if (status === "confirmado" && ev.limite_participantes != null) {
      const [r] = await c.query<RowDataPacket[]>(
        "SELECT COUNT(*) n, SUM(user_id = ?) eu FROM event_rsvps WHERE event_id = ? AND occurrence_date = ? AND status = 'confirmado'", [actor, eventId, date]);
      if (!Number(r[0].eu) && Number(r[0].n) >= ev.limite_participantes) throw new DomainError("Vagas esgotadas para esta data.");
    }
    await c.query(
      `INSERT INTO event_rsvps (event_id, occurrence_date, user_id, status) VALUES (?,?,?,?)
       ON DUPLICATE KEY UPDATE status = VALUES(status)`, [eventId, date, actor, status]);
  });
}

export type RsvpResumo = { confirmado: number; talvez: number; nao_vai: number; nomes?: { nome: string; status: string }[] };

/** Contagens para quem vê o evento; nomes somente para quem gerencia (privacidade da participação). */
export async function rsvpSummary(actor: number, eventId: number, date: string): Promise<RsvpResumo> {
  const ev = await getEvent(actor, eventId);
  const c = await query<RowDataPacket>("SELECT status, COUNT(*) n FROM event_rsvps WHERE event_id = ? AND occurrence_date = ? GROUP BY status", [eventId, date]);
  const res: RsvpResumo = { confirmado: 0, talvez: 0, nao_vai: 0 };
  for (const r of c) res[r.status as "confirmado"] = Number(r.n);
  if (await can(actor, "eventos", "editar", ev.unit_id)) {
    res.nomes = (await query<RowDataPacket>(
      "SELECT u.nome, r.status FROM event_rsvps r JOIN users u ON u.id = r.user_id WHERE r.event_id = ? AND r.occurrence_date = ? ORDER BY r.status, u.nome",
      [eventId, date])) as unknown as { nome: string; status: string }[];
  }
  return res;
}

export async function eventHistory(actor: number, id: number) {
  const ev = await getEvent(actor, id);
  await assertCan(actor, "eventos", "editar", ev.unit_id);
  return query<RowDataPacket & { acao: string; detalhes: string | null; criado_em: Date; nome: string | null }>(
    `SELECT h.acao, h.detalhes, h.criado_em, u.nome FROM event_history h LEFT JOIN users u ON u.id = h.user_id WHERE h.event_id = ? ORDER BY h.id DESC`, [id]);
}

export { utcToLocal, todayLocal };

export const hasPassed = (o: { inicio: Date; fim: Date | null }) => (o.fim ?? o.inicio).getTime() < Date.now();

/** Eventos dos últimos 90 dias (e da próxima semana) que o usuário enxerga — usado para vincular álbuns. */
export async function eventosRecentes(actor: number) {
  const agora = Date.now();
  const ocs = await listOccurrences(actor, new Date(agora - 90 * 86400_000), new Date(agora + 7 * 86400_000), 200);
  return [...new Map(ocs.map((o) => [o.evento.id, o.evento])).values()].slice(0, 40);
}
