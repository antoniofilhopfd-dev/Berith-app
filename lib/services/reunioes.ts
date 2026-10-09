import type { RowDataPacket } from "mysql2/promise";
import { execute, query, tx } from "@/lib/db";
import { accessibleUnitIds, assertCan, can } from "@/lib/permissions";
import { localToUtc } from "@/lib/time";
import type { z } from "zod";
import type { decisaoSchema, reuniaoSchema } from "@/lib/validation/organizacao";
import { createTask } from "./tarefas";
import { DomainError, NotFoundError } from "./errors";
import { audit } from "./audit";

export type Reuniao = { id: number; unit_id: number; unit_nome: string; titulo: string; inicio: Date; fim: Date | null; local: string | null; pauta: string | null; ata: string | null; status: "agendada" | "realizada" | "cancelada" };
const SEL = `SELECT m.*, o.nome AS unit_nome FROM meetings m JOIN org_units o ON o.id = m.unit_id`;

export async function listMeetings(actor: number): Promise<Reuniao[]> {
  const ids = await accessibleUnitIds(actor, "reunioes", "ver");
  const alvo = ids === "todas" ? "1=1" : ids.length ? "(m.unit_id IN (?) OR EXISTS (SELECT 1 FROM meeting_participants p WHERE p.meeting_id = m.id AND p.user_id = ?))" : "EXISTS (SELECT 1 FROM meeting_participants p WHERE p.meeting_id = m.id AND p.user_id = ?)";
  const ps = ids === "todas" ? [] : ids.length ? [ids, actor] : [actor];
  return query<Reuniao & RowDataPacket>(`${SEL} WHERE ${alvo} ORDER BY m.inicio DESC LIMIT 100`, ps);
}

export async function getMeeting(actor: number, id: number) {
  const r = await query<Reuniao & RowDataPacket>(`${SEL} WHERE m.id = ?`, [id]);
  const m = r[0];
  if (!m) throw new NotFoundError();
  const part = await query<RowDataPacket>("SELECT 1 x FROM meeting_participants WHERE meeting_id = ? AND user_id = ?", [id, actor]);
  if (!part.length && !(await can(actor, "reunioes", "ver", m.unit_id))) throw new NotFoundError();
  const [participantes, decisoes, gerencia] = await Promise.all([
    query<RowDataPacket & { nome: string }>("SELECT u.nome FROM meeting_participants p JOIN users u ON u.id = p.user_id WHERE p.meeting_id = ? ORDER BY u.nome", [id]),
    query<RowDataPacket & { id: number; texto: string; task_id: number | null; task_status: string | null }>(
      "SELECT d.id, d.texto, d.task_id, t.status AS task_status FROM meeting_decisions d LEFT JOIN tasks t ON t.id = d.task_id WHERE d.meeting_id = ? ORDER BY d.id", [id]),
    can(actor, "reunioes", "editar", m.unit_id),
  ]);
  return { reuniao: m, participantes, decisoes, gerencia };
}

/** Convida automaticamente os integrantes ativos da estrutura. */
export async function createMeeting(actor: number, d: z.infer<typeof reuniaoSchema>) {
  await assertCan(actor, "reunioes", "criar", d.unitId);
  const u = await query<RowDataPacket>("SELECT ativo FROM org_units WHERE id = ?", [d.unitId]);
  if (!u[0]?.ativo) throw new DomainError("Estrutura inválida.");
  const inicio = localToUtc(d.data, d.horaInicio);
  const fim = d.horaFim ? localToUtc(d.data, d.horaFim) : null;
  if (fim && fim.getTime() <= inicio.getTime()) throw new DomainError("O término deve ser depois do início.");
  const id = await tx(async (c) => {
    const [r] = await c.query<import("mysql2/promise").ResultSetHeader>(
      "INSERT INTO meetings (unit_id, titulo, inicio, fim, local, pauta, criado_por) VALUES (?,?,?,?,?,?,?)", [d.unitId, d.titulo, inicio, fim, d.local, d.pauta, actor]);
    await c.query(
      `INSERT IGNORE INTO meeting_participants (meeting_id, user_id)
       SELECT ?, u.id FROM users u JOIN memberships m ON m.user_id = u.id
       WHERE u.status = 'ativo' AND m.unit_id = ? AND m.inicio <= UTC_DATE() AND (m.fim IS NULL OR m.fim > UTC_DATE())`, [r.insertId, d.unitId]);
    return r.insertId;
  });
  await audit(actor, "reuniao.criar", { entidade: "meeting", entidadeId: id });
  return id;
}

export async function saveMinutes(actor: number, id: number, ata: string, status: "agendada" | "realizada" | "cancelada") {
  const { reuniao } = await getMeeting(actor, id);
  await assertCan(actor, "reunioes", "editar", reuniao.unit_id);
  if (ata.length > 20000) throw new DomainError("Ata muito longa.");
  await execute("UPDATE meetings SET ata = ?, status = ? WHERE id = ?", [ata || null, status, id]);
  await audit(actor, "reuniao.ata", { entidade: "meeting", entidadeId: id, detalhes: { status } });
}

/** Decisão registrada; opcionalmente gera tarefa vinculada (exige também permissão de criar tarefas). */
export async function addDecision(actor: number, d: z.infer<typeof decisaoSchema>) {
  const { reuniao } = await getMeeting(actor, d.meetingId);
  await assertCan(actor, "reunioes", "editar", reuniao.unit_id);
  if (d.gerarTarefa) await assertCan(actor, "tarefas", "criar", reuniao.unit_id);
  let taskId: number | null = null;
  if (d.gerarTarefa) {
    taskId = await createTask(actor, { unitId: reuniao.unit_id, titulo: d.texto.slice(0, 160), descricao: `Decisão da reunião "${reuniao.titulo}".`,
      prazo: d.prazo, prioridade: "media", responsavelEmail: d.responsavelEmail }, reuniao.id);
  }
  await execute("INSERT INTO meeting_decisions (meeting_id, texto, task_id) VALUES (?,?,?)", [d.meetingId, d.texto, taskId]);
  await audit(actor, "reuniao.decisao", { entidade: "meeting", entidadeId: d.meetingId, detalhes: { taskId } });
  return taskId;
}

export async function nextMeetings(actor: number) {
  return (await listMeetings(actor)).filter((m) => m.status === "agendada" && m.inicio.getTime() >= Date.now() - 3600_000).reverse().slice(0, 5);
}
