import type { RowDataPacket } from "mysql2/promise";
import { execute, query } from "@/lib/db";
import { assertCan } from "@/lib/permissions";
import { audit } from "./audit";
import { DomainError, NotFoundError } from "./errors";

export async function listRoles() {
  return query<RowDataPacket & { codigo: string; nome: string; e_global: number }>("SELECT codigo, nome, e_global FROM roles ORDER BY e_global DESC, nome");
}

/** Papel global exige unitId nulo; papel com escopo exige uma estrutura. Só quem tem "permissoes" no escopo atribui. */
export async function assignRole(actor: number, userId: number, codigo: string, unitId: number | null) {
  const role = (await query<RowDataPacket>("SELECT id, e_global FROM roles WHERE codigo = ?", [codigo]))[0];
  if (!role) throw new DomainError("Função inexistente.");
  if (role.e_global && unitId != null) throw new DomainError("Esta função é global e não aceita estrutura.");
  if (!role.e_global && unitId == null) throw new DomainError("Esta função exige uma estrutura.");
  await assertCan(actor, "estruturas", "permissoes", unitId);
  const u = await query<RowDataPacket>("SELECT status FROM users WHERE id = ?", [userId]);
  if (u[0]?.status !== "ativo") throw new DomainError("Pessoa não encontrada ou inativa.");
  await execute(
    "INSERT IGNORE INTO user_roles (user_id, role_id, scope_unit_id, scope_unit_id_key) VALUES (?, ?, ?, ?)",
    [userId, role.id, unitId, unitId ?? 0]);
  await audit(actor, "papel.atribuir", { entidade: "user", entidadeId: userId, detalhes: { codigo, unitId } });
}

export async function revokeRole(actor: number, userRoleId: number) {
  const r = (await query<RowDataPacket>("SELECT user_id, scope_unit_id FROM user_roles WHERE id = ?", [userRoleId]))[0];
  if (!r) throw new NotFoundError();
  await assertCan(actor, "estruturas", "permissoes", r.scope_unit_id);
  if (r.user_id === actor) {
    const admins = await query<RowDataPacket>(
      `SELECT COUNT(*) AS n FROM user_roles ur JOIN roles ro ON ro.id = ur.role_id WHERE ro.codigo = 'admin_geral'`);
    const own = await query<RowDataPacket>(
      `SELECT 1 AS x FROM user_roles ur JOIN roles ro ON ro.id = ur.role_id WHERE ur.id = ? AND ro.codigo = 'admin_geral'`, [userRoleId]);
    if (own.length && Number(admins[0].n) <= 1) throw new DomainError("Não é possível remover o último administrador geral.");
  }
  await execute("DELETE FROM user_roles WHERE id = ?", [userRoleId]);
  await audit(actor, "papel.revogar", { entidade: "user", entidadeId: r.user_id, detalhes: { userRoleId } });
}
