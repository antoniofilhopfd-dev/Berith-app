import type { RowDataPacket } from "mysql2/promise";
import { execute, query } from "@/lib/db";
import { audit } from "./audit";

export const TIPOS_NOTIFICACAO = ["evento", "comunicado", "escala", "tarefa", "reuniao", "conteudo", "financeiro", "sistema"] as const;
export type TipoNotificacao = (typeof TIPOS_NOTIFICACAO)[number];
export const TIPO_NOTIF_ROTULO: Record<TipoNotificacao, string> = {
  evento: "Eventos", comunicado: "Comunicados", escala: "Escalas", tarefa: "Tarefas", reuniao: "Reuniões", conteudo: "Conteúdos", financeiro: "Financeiro (aprovações)", sistema: "Avisos do sistema",
};
export type Notificacao = { id: number; tipo: TipoNotificacao; titulo: string; corpo: string | null; url: string | null; lida_em: Date | null; criado_em: Date };

export type NovaNotificacao = { tipo: TipoNotificacao; titulo: string; corpo?: string | null; url?: string | null; dedupeKey: string; agendadaPara?: Date };

/**
 * Cria notificações internas respeitando as preferências por tipo. Duplicidade é impossível:
 * (usuário, dedupe_key) é único. Só use com destinatários já autorizados a ver o assunto.
 */
export async function notificar(userIds: number[], n: NovaNotificacao): Promise<number> {
  const ids = [...new Set(userIds)];
  if (ids.length === 0) return 0;
  const off = await query<RowDataPacket>("SELECT user_id FROM notificacao_tipos WHERE tipo = ? AND ativo = 0 AND user_id IN (?)", [n.tipo, ids]);
  const bloqueados = new Set(off.map((r) => Number(r.user_id)));
  const alvo = ids.filter((i) => !bloqueados.has(i));
  let criadas = 0;
  for (let i = 0; i < alvo.length; i += 200) {
    const lote = alvo.slice(i, i + 200);
    const r = await execute(
      `INSERT IGNORE INTO notificacoes (user_id, tipo, titulo, corpo, url, dedupe_key, agendada_para) VALUES ${lote.map(() => "(?,?,?,?,?,?,?)").join(",")}`,
      lote.flatMap((u) => [u, n.tipo, n.titulo.slice(0, 160), n.corpo?.slice(0, 300) ?? null, n.url?.slice(0, 300) ?? null, n.dedupeKey.slice(0, 120), n.agendadaPara ?? new Date()]));
    criadas += r.affectedRows;
  }
  return criadas;
}

/** Nunca derruba a ação principal: falha em notificar é registrada e ignorada. */
export async function notificarSeguro(fn: () => Promise<unknown>) {
  try { await fn(); } catch (e) { console.error("[notificacoes]", e instanceof Error ? e.message : "erro"); }
}

/** Quem deve ser avisado sobre algo de uma estrutura: integrantes ativos e responsáveis (papéis com escopo no ramo). unit null = comunidade toda. */
export async function destinatarios(unitId: number | null, excluir: number[] = []): Promise<number[]> {
  const rows = unitId == null
    ? await query<RowDataPacket>("SELECT id FROM users WHERE status = 'ativo'")
    : await query<RowDataPacket>(
        `WITH RECURSIVE anc AS (SELECT id, parent_id FROM org_units WHERE id = ? UNION ALL SELECT o.id, o.parent_id FROM org_units o JOIN anc a ON o.id = a.parent_id)
         SELECT DISTINCT u.id FROM users u WHERE u.status = 'ativo' AND (
           EXISTS (SELECT 1 FROM memberships m WHERE m.user_id = u.id AND m.unit_id = ? AND m.inicio <= UTC_DATE() AND (m.fim IS NULL OR m.fim > UTC_DATE()))
           OR EXISTS (SELECT 1 FROM user_roles ur JOIN roles r ON r.id = ur.role_id AND r.e_global = 0 WHERE ur.user_id = u.id AND ur.scope_unit_id IN (SELECT id FROM anc)))`, [unitId, unitId]);
  const ex = new Set(excluir);
  return rows.map((r) => Number(r.id)).filter((i) => !ex.has(i));
}

/** Quem pode aprovar lançamentos (papel global com a permissão), excluindo quem lançou. */
export async function aprovadoresFinanceiros(excluir: number): Promise<number[]> {
  const r = await query<RowDataPacket>(
    `SELECT DISTINCT ur.user_id id FROM user_roles ur JOIN roles ro ON ro.id = ur.role_id AND ro.e_global = 1 AND ur.scope_unit_id IS NULL
     JOIN role_permissions rp ON rp.role_id = ro.id AND rp.recurso = 'financeiro' AND rp.acao = 'aprovar' JOIN users u ON u.id = ur.user_id AND u.status = 'ativo' WHERE ur.user_id <> ?`, [excluir]);
  return r.map((x) => Number(x.id));
}

/* ---- Leitura e preferências (sempre do próprio usuário) ---- */
export async function listar(actor: number, limite = 50): Promise<Notificacao[]> {
  return query<Notificacao & RowDataPacket>(
    "SELECT id, tipo, titulo, corpo, url, lida_em, criado_em FROM notificacoes WHERE user_id = ? AND agendada_para <= UTC_TIMESTAMP() ORDER BY id DESC LIMIT ?", [actor, limite]);
}
export async function naoLidas(actor: number): Promise<number> {
  const r = await query<RowDataPacket>("SELECT COUNT(*) n FROM notificacoes WHERE user_id = ? AND lida_em IS NULL AND agendada_para <= UTC_TIMESTAMP()", [actor]);
  return Number(r[0].n);
}
export async function marcarLida(actor: number, id: number) {
  await execute("UPDATE notificacoes SET lida_em = UTC_TIMESTAMP() WHERE id = ? AND user_id = ? AND lida_em IS NULL", [id, actor]);
}
export async function marcarTodasLidas(actor: number) {
  await execute("UPDATE notificacoes SET lida_em = UTC_TIMESTAMP() WHERE user_id = ? AND lida_em IS NULL AND agendada_para <= UTC_TIMESTAMP()", [actor]);
}

export type Preferencias = { pushAtivo: boolean; silencioInicio: string | null; silencioFim: string | null; tipos: Record<TipoNotificacao, boolean> };
export async function preferencias(actor: number): Promise<Preferencias> {
  const [c, t, d] = await Promise.all([
    query<RowDataPacket>("SELECT push_ativo, TIME_FORMAT(silencio_inicio, '%H:%i') ini, TIME_FORMAT(silencio_fim, '%H:%i') fim FROM notificacao_config WHERE user_id = ?", [actor]),
    query<RowDataPacket>("SELECT tipo, ativo FROM notificacao_tipos WHERE user_id = ?", [actor]),
    query<RowDataPacket>("SELECT COUNT(*) n FROM push_subscriptions WHERE user_id = ?", [actor]),
  ]);
  void d;
  const tipos = Object.fromEntries(TIPOS_NOTIFICACAO.map((k) => [k, true])) as Record<TipoNotificacao, boolean>;
  for (const r of t) if (r.tipo in tipos) tipos[r.tipo as TipoNotificacao] = Boolean(r.ativo);
  return { pushAtivo: c[0] ? Boolean(c[0].push_ativo) : true, silencioInicio: c[0]?.ini ?? null, silencioFim: c[0]?.fim ?? null, tipos };
}
export async function salvarPreferencias(actor: number, p: { pushAtivo: boolean; silencioInicio: string | null; silencioFim: string | null; tipos: Partial<Record<TipoNotificacao, boolean>> }) {
  const hhmm = /^([01]\d|2[0-3]):[0-5]\d$/;
  if ((p.silencioInicio && !hhmm.test(p.silencioInicio)) || (p.silencioFim && !hhmm.test(p.silencioFim))) throw new Error("Horário de silêncio inválido.");
  if (!!p.silencioInicio !== !!p.silencioFim) throw new Error("Informe início e fim do horário de silêncio.");
  await execute(
    `INSERT INTO notificacao_config (user_id, push_ativo, silencio_inicio, silencio_fim) VALUES (?,?,?,?)
     ON DUPLICATE KEY UPDATE push_ativo = VALUES(push_ativo), silencio_inicio = VALUES(silencio_inicio), silencio_fim = VALUES(silencio_fim)`,
    [actor, p.pushAtivo ? 1 : 0, p.silencioInicio, p.silencioFim]);
  for (const k of TIPOS_NOTIFICACAO) {
    if (p.tipos[k] === undefined) continue;
    await execute("INSERT INTO notificacao_tipos (user_id, tipo, ativo) VALUES (?,?,?) ON DUPLICATE KEY UPDATE ativo = VALUES(ativo)", [actor, k, p.tipos[k] ? 1 : 0]);
  }
  await audit(actor, "notificacoes.preferencias", { entidade: "user", entidadeId: actor });
}

/** Silêncio considera horário local da comunidade; aceita janela que cruza a meia-noite (22:00–07:00). */
export function emSilencio(agoraHHMM: string, ini: string | null, fim: string | null): boolean {
  if (!ini || !fim || ini === fim) return false;
  return ini < fim ? agoraHHMM >= ini && agoraHHMM < fim : agoraHHMM >= ini || agoraHHMM < fim;
}
