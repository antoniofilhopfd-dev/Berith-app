import type { RowDataPacket } from "mysql2/promise";
import { query } from "@/lib/db";

export const RECURSOS = [
  "planejamento", "calendario", "producao", "aprovacao", "publicacao", "midia",
  "relatorios", "equipe", "integracoes", "configuracoes", "auditoria",
] as const;
export const ACOES = ["ver", "criar", "editar", "excluir", "aprovar", "exportar", "gerir"] as const;
export type Recurso = (typeof RECURSOS)[number];
export type Acao = (typeof ACOES)[number];

/** Perfis do Ministério de Comunicação. Papéis legados (comunidade) não concedem nada. */
export const PERFIS = ["admin", "coordenador", "integrante", "aprovador"] as const;
export type Perfil = (typeof PERFIS)[number];
export const PERFIL_ROTULO: Record<Perfil, string> = {
  admin: "Administrador", coordenador: "Coordenador de Comunicação", integrante: "Integrante", aprovador: "Aprovador",
};

export class ForbiddenError extends Error {
  constructor(msg = "Acesso negado.") {
    super(msg);
    this.name = "ForbiddenError";
  }
}

/** Negação por padrão: só um perfil atual (global) com a permissão concede acesso. Sempre consultado no servidor. */
export async function can(userId: number, recurso: Recurso, acao: Acao): Promise<boolean> {
  const rows = await query<RowDataPacket>(
    `SELECT 1 AS ok FROM user_roles ur
       JOIN roles r ON r.id = ur.role_id AND r.e_global = 1 AND r.codigo IN (?)
       JOIN role_permissions rp ON rp.role_id = r.id AND rp.recurso = ? AND rp.acao = ?
       JOIN users u ON u.id = ur.user_id AND u.status = 'ativo'
     WHERE ur.user_id = ? AND ur.scope_unit_id IS NULL LIMIT 1`,
    [PERFIS as unknown as string[], recurso, acao, userId],
  );
  return rows.length > 0;
}

export async function assertCan(userId: number, recurso: Recurso, acao: Acao) {
  if (!(await can(userId, recurso, acao))) throw new ForbiddenError();
}

/** Perfis do usuário (em geral um só). */
export async function perfisDe(userId: number): Promise<Perfil[]> {
  const rows = await query<RowDataPacket>(
    `SELECT r.codigo FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = ? AND r.codigo IN (?) AND ur.scope_unit_id IS NULL`,
    [userId, PERFIS as unknown as string[]],
  );
  return rows.map((r) => r.codigo as Perfil);
}

/** Mapa de tudo que o usuário pode fazer (usado para montar menus e esconder botões; o servidor sempre revalida). */
export async function permissoesDe(userId: number): Promise<Set<string>> {
  const rows = await query<RowDataPacket>(
    `SELECT DISTINCT rp.recurso, rp.acao FROM user_roles ur
       JOIN roles r ON r.id = ur.role_id AND r.e_global = 1 AND r.codigo IN (?)
       JOIN role_permissions rp ON rp.role_id = r.id
       JOIN users u ON u.id = ur.user_id AND u.status = 'ativo'
     WHERE ur.user_id = ? AND ur.scope_unit_id IS NULL`,
    [PERFIS as unknown as string[], userId],
  );
  return new Set(rows.map((r) => `${r.recurso}:${r.acao}`));
}
