import type { RowDataPacket } from "mysql2/promise";
import { query } from "@/lib/db";
import { assertCan } from "@/lib/permissions";
import { localToUtc } from "@/lib/time";
import { addDays } from "@/lib/time";

export type Evento = { id: number; acao: string; entidade: string | null; entidade_id: string | null; detalhes: string | null; ip: string | null; criado_em: Date; nome: string | null };
export const POR_PAGINA = 50;

/** Registro de auditoria (somente leitura). Detalhes não contêm segredos: tokens e senhas nunca são gravados. */
export async function listarAuditoria(actor: number, f: { acao?: string; userId?: number; de?: string; ate?: string; pagina?: number } = {}) {
  await assertCan(actor, "auditoria", "ver");
  const w: string[] = []; const p: unknown[] = [];
  if (f.acao) { w.push("l.acao LIKE ?"); p.push(`${f.acao.replace(/[%_\\]/g, "\\$&")}%`); }
  if (f.userId) { w.push("l.user_id = ?"); p.push(f.userId); }
  if (f.de) { w.push("l.criado_em >= ?"); p.push(localToUtc(f.de, "00:00")); }
  if (f.ate) { w.push("l.criado_em < ?"); p.push(localToUtc(addDays(f.ate, 1), "00:00")); }
  const where = w.length ? `WHERE ${w.join(" AND ")}` : "";
  const pg = Math.max(1, f.pagina ?? 1);
  const total = Number((await query<RowDataPacket>(`SELECT COUNT(*) n FROM audit_log l ${where}`, p))[0].n);
  const itens = await query<Evento & RowDataPacket>(
    `SELECT l.id, l.acao, l.entidade, l.entidade_id, l.detalhes, l.ip, l.criado_em, u.nome FROM audit_log l LEFT JOIN users u ON u.id = l.user_id ${where} ORDER BY l.id DESC LIMIT ? OFFSET ?`, [...p, POR_PAGINA, (pg - 1) * POR_PAGINA]);
  return { itens, total };
}
