import type { RowDataPacket } from "mysql2/promise";
import { execute, query } from "@/lib/db";
import { accessibleUnitIds, assertCan, can } from "@/lib/permissions";
import type { z } from "zod";
import type { tarefaSchema } from "@/lib/validation/organizacao";
import { DomainError, NotFoundError } from "./errors";
import { audit } from "./audit";
import { destinatarios, notificar, notificarSeguro } from "./notificacoes";

export type Tarefa = {
  id: number; unit_id: number; unit_nome: string; titulo: string; descricao: string | null; prazo: string | null;
  prioridade: "baixa" | "media" | "alta"; status: "aberta" | "em_andamento" | "concluida" | "cancelada";
  responsavel_id: number | null; responsavel_nome: string | null; meeting_id: number | null; criado_por: number; atrasada: number;
};
export const STATUS = ["aberta", "em_andamento", "concluida", "cancelada"] as const;

const SEL = `SELECT t.*, o.nome AS unit_nome, r.nome AS responsavel_nome,
  (t.prazo IS NOT NULL AND t.prazo < UTC_DATE() AND t.status IN ('aberta','em_andamento')) AS atrasada
  FROM tasks t JOIN org_units o ON o.id = t.unit_id LEFT JOIN users r ON r.id = t.responsavel_id`;
const ORD = `ORDER BY FIELD(t.status,'em_andamento','aberta','concluida','cancelada'), t.prazo IS NULL, t.prazo, FIELD(t.prioridade,'alta','media','baixa'), t.id DESC`;

export async function listTasks(actor: number, escopo: "minhas" | "estruturas", status?: string): Promise<Tarefa[]> {
  const filtroStatus = status && (STATUS as readonly string[]).includes(status) ? " AND t.status = ?" : "";
  const ps = filtroStatus ? [status] : [];
  if (escopo === "minhas") return query<Tarefa & RowDataPacket>(`${SEL} WHERE t.responsavel_id = ?${filtroStatus} ${ORD} LIMIT 200`, [actor, ...ps]);
  const ids = await accessibleUnitIds(actor, "tarefas", "ver");
  if (ids !== "todas" && ids.length === 0) return [];
  return query<Tarefa & RowDataPacket>(`${SEL} WHERE ${ids === "todas" ? "1=1" : "t.unit_id IN (?)"}${filtroStatus} ${ORD} LIMIT 200`, ids === "todas" ? ps : [ids, ...ps]);
}

export async function getTask(actor: number, id: number) {
  const r = await query<Tarefa & RowDataPacket>(`${SEL} WHERE t.id = ?`, [id]);
  const t = r[0];
  if (!t || (t.responsavel_id !== actor && !(await can(actor, "tarefas", "ver", t.unit_id)))) throw new NotFoundError();
  const [comentarios, historico] = await Promise.all([
    query<RowDataPacket & { nome: string; texto: string; criado_em: Date }>(
      "SELECT u.nome, c.texto, c.criado_em FROM task_comments c JOIN users u ON u.id = c.user_id WHERE c.task_id = ? ORDER BY c.id", [id]),
    query<RowDataPacket & { acao: string; detalhes: string | null; nome: string | null; criado_em: Date }>(
      "SELECT h.acao, h.detalhes, u.nome, h.criado_em FROM task_history h LEFT JOIN users u ON u.id = h.user_id WHERE h.task_id = ? ORDER BY h.id DESC", [id]),
  ]);
  const gerencia = await can(actor, "tarefas", "editar", t.unit_id);
  return { tarefa: t, comentarios, historico, gerencia, souResponsavel: t.responsavel_id === actor };
}

async function hist(taskId: number, user: number | null, acao: string, detalhes?: string) {
  await execute("INSERT INTO task_history (task_id, user_id, acao, detalhes) VALUES (?,?,?,?)", [taskId, user, acao, detalhes?.slice(0, 500) ?? null]);
}

async function resolveResponsavel(unitId: number, email: string | undefined) {
  if (!email) return null;
  const r = await query<RowDataPacket>(
    `SELECT u.id FROM users u WHERE u.email = ? AND u.status = 'ativo' AND EXISTS
       (SELECT 1 FROM memberships m WHERE m.user_id = u.id AND m.unit_id = ? AND m.inicio <= UTC_DATE() AND (m.fim IS NULL OR m.fim > UTC_DATE()))`, [email, unitId]);
  if (!r[0]) throw new DomainError("O responsável precisa ser integrante ativo desta estrutura.");
  return r[0].id as number;
}

export async function createTask(actor: number, d: z.infer<typeof tarefaSchema>, meetingId: number | null = null) {
  await assertCan(actor, "tarefas", "criar", d.unitId);
  const u = await query<RowDataPacket>("SELECT ativo FROM org_units WHERE id = ?", [d.unitId]);
  if (!u[0]?.ativo) throw new DomainError("Estrutura inválida.");
  const resp = await resolveResponsavel(d.unitId, d.responsavelEmail);
  const r = await execute("INSERT INTO tasks (unit_id, titulo, descricao, prazo, prioridade, responsavel_id, meeting_id, criado_por) VALUES (?,?,?,?,?,?,?,?)",
    [d.unitId, d.titulo, d.descricao, d.prazo ?? null, d.prioridade, resp, meetingId, actor]);
  await hist(r.insertId, actor, "criada", meetingId ? "gerada a partir de reunião" : undefined);
  await audit(actor, "tarefa.criar", { entidade: "task", entidadeId: r.insertId });
  if (resp && resp !== actor) await notificarSeguro(() => notificar([resp], { tipo: "tarefa", titulo: "Nova tarefa para você", corpo: d.titulo, url: `/tarefas/${r.insertId}`, dedupeKey: `tarefa:${r.insertId}:atribuida:${resp}` }));
  return r.insertId;
}

export async function updateTask(actor: number, id: number, d: Pick<z.infer<typeof tarefaSchema>, "titulo" | "descricao" | "prazo" | "prioridade" | "responsavelEmail">) {
  const { tarefa } = await getTask(actor, id);
  await assertCan(actor, "tarefas", "editar", tarefa.unit_id);
  const resp = d.responsavelEmail ? await resolveResponsavel(tarefa.unit_id, d.responsavelEmail) : tarefa.responsavel_id;
  await execute("UPDATE tasks SET titulo=?, descricao=?, prazo=?, prioridade=?, responsavel_id=? WHERE id=?", [d.titulo, d.descricao, d.prazo ?? null, d.prioridade, resp, id]);
  await hist(id, actor, "editada");
  if (resp && resp !== tarefa.responsavel_id && resp !== actor) await notificarSeguro(() => notificar([resp], { tipo: "tarefa", titulo: "Tarefa atribuída a você", corpo: d.titulo, url: `/tarefas/${id}`, dedupeKey: `tarefa:${id}:atribuida:${resp}` }));
}

/** Gestor ou o próprio responsável alteram o andamento. */
export async function setStatus(actor: number, id: number, status: (typeof STATUS)[number]) {
  const { tarefa, gerencia, souResponsavel } = await getTask(actor, id);
  if (!gerencia && !souResponsavel) throw new NotFoundError();
  if (status === "cancelada" && !gerencia) throw new DomainError("Somente a coordenação cancela tarefas.");
  await execute("UPDATE tasks SET status = ?, concluida_em = IF(? = 'concluida', UTC_TIMESTAMP(), NULL) WHERE id = ?", [status, status, id]);
  await hist(id, actor, "status", `${tarefa.status} → ${status}`);
  await audit(actor, "tarefa.status", { entidade: "task", entidadeId: id, detalhes: { status } });
}

export async function comment(actor: number, id: number, texto: string) {
  await getTask(actor, id); // exige acesso
  const t = texto.trim();
  if (t.length < 1 || t.length > 2000) throw new DomainError("Comentário inválido.");
  await execute("INSERT INTO task_comments (task_id, user_id, texto) VALUES (?,?,?)", [id, actor, t]);
  await hist(id, actor, "comentário");
}

export async function myOpenCount(actor: number) {
  const r = await query<RowDataPacket>("SELECT COUNT(*) n FROM tasks WHERE responsavel_id = ? AND status IN ('aberta','em_andamento')", [actor]);
  return Number(r[0].n);
}
