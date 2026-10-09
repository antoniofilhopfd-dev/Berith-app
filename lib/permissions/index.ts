import type { RowDataPacket } from "mysql2/promise";
import { query } from "@/lib/db";

export const RECURSOS = [
  "eventos", "membros", "estruturas", "comunicados", "escalas", "presencas",
  "tarefas", "reunioes", "conteudos", "midia", "financeiro",
] as const;
export const ACOES = ["ver", "criar", "editar", "excluir", "aprovar", "exportar", "integrantes", "permissoes"] as const;
export type Recurso = (typeof RECURSOS)[number];
export type Acao = (typeof ACOES)[number];

/** Recursos que um simples integrante pode VER na(s) estrutura(s) a que pertence. Financeiro nunca. */
export const VISIVEL_AO_INTEGRANTE: readonly Recurso[] = [
  "eventos", "comunicados", "escalas", "tarefas", "reunioes", "conteudos", "midia",
];

export class ForbiddenError extends Error {
  constructor(msg = "Acesso negado.") {
    super(msg);
    this.name = "ForbiddenError";
  }
}

/**
 * Negação por padrão. Concede acesso quando:
 *  - papel GLOBAL (e_global=1, sem escopo) com a permissão; ou
 *  - papel com escopo em uma estrutura que é a própria `unitId` ou ancestral dela; ou
 *  - integrante ativo da própria `unitId` e ação "ver" em recurso visível ao integrante.
 * Sem `unitId`, apenas papéis globais valem.
 */
export async function can(userId: number, recurso: Recurso, acao: Acao, unitId?: number | null): Promise<boolean> {
  const hasUnit = unitId != null;
  const rows = await query<RowDataPacket>(
    `WITH RECURSIVE anc AS (
        SELECT id, parent_id FROM org_units WHERE id = ?
        UNION ALL
        SELECT o.id, o.parent_id FROM org_units o JOIN anc a ON o.id = a.parent_id
     )
     SELECT 1 AS ok FROM user_roles ur
       JOIN roles r ON r.id = ur.role_id
       JOIN role_permissions rp ON rp.role_id = r.id AND rp.recurso = ? AND rp.acao = ?
     WHERE ur.user_id = ?
       AND ((r.e_global = 1 AND ur.scope_unit_id IS NULL)
            OR (r.e_global = 0 AND ur.scope_unit_id IS NOT NULL AND ur.scope_unit_id IN (SELECT id FROM anc)))
     LIMIT 1`,
    [hasUnit ? unitId : 0, recurso, acao, userId],
  );
  if (rows.length) return true;
  if (hasUnit && acao === "ver" && VISIVEL_AO_INTEGRANTE.includes(recurso)) {
    const m = await query<RowDataPacket>(
      `SELECT 1 AS ok FROM memberships
       WHERE user_id = ? AND unit_id = ? AND inicio <= UTC_DATE() AND (fim IS NULL OR fim > UTC_DATE()) LIMIT 1`,
      [userId, unitId],
    );
    return m.length > 0;
  }
  return false;
}

export async function assertCan(userId: number, recurso: Recurso, acao: Acao, unitId?: number | null) {
  if (!(await can(userId, recurso, acao, unitId))) throw new ForbiddenError();
}

/**
 * Estruturas em que o usuário pode exercer (recurso, acao): própria + descendentes do escopo.
 * Use em listagens: filtre sempre por este conjunto no SQL.
 */
export async function accessibleUnitIds(userId: number, recurso: Recurso, acao: Acao): Promise<number[] | "todas"> {
  const glob = await query<RowDataPacket>(
    `SELECT 1 AS ok FROM user_roles ur JOIN roles r ON r.id = ur.role_id
       JOIN role_permissions rp ON rp.role_id = r.id AND rp.recurso = ? AND rp.acao = ?
     WHERE ur.user_id = ? AND r.e_global = 1 AND ur.scope_unit_id IS NULL LIMIT 1`,
    [recurso, acao, userId],
  );
  if (glob.length) return "todas";
  const rows = await query<RowDataPacket>(
    `WITH RECURSIVE sub AS (
        SELECT ur.scope_unit_id AS id FROM user_roles ur
          JOIN roles r ON r.id = ur.role_id AND r.e_global = 0
          JOIN role_permissions rp ON rp.role_id = r.id AND rp.recurso = ? AND rp.acao = ?
        WHERE ur.user_id = ? AND ur.scope_unit_id IS NOT NULL
        UNION
        SELECT o.id FROM org_units o JOIN sub s ON o.parent_id = s.id
     ) SELECT id FROM sub
     UNION
     SELECT m.unit_id FROM memberships m
       WHERE ? = 'ver' AND ? IN ('eventos','comunicados','escalas','tarefas','reunioes','conteudos','midia')
         AND m.user_id = ? AND m.inicio <= UTC_DATE() AND (m.fim IS NULL OR m.fim > UTC_DATE())`,
    [recurso, acao, userId, acao, recurso, userId],
  );
  return rows.map((r) => Number(r.id));
}
