import type { RowDataPacket } from "mysql2/promise";
import { execute, query, tx } from "@/lib/db";
import { accessibleUnitIds, assertCan, can } from "@/lib/permissions";
import { audit } from "./audit";
import { DomainError, NotFoundError } from "./errors";

export type Unit = {
  id: number; tipo: string; nome: string; descricao: string | null; parent_id: number | null;
  ativo: number; parent_nome?: string | null; integrantes?: number;
};

/** Estruturas que o usuário pode ver (coordenação: a sua e as descendentes). */
export async function listUnits(actor: number): Promise<Unit[]> {
  const ids = await accessibleUnitIds(actor, "estruturas", "ver");
  if (ids !== "todas" && ids.length === 0) return [];
  const where = ids === "todas" ? "" : "WHERE u.id IN (?)";
  return query<Unit & RowDataPacket>(
    `SELECT u.id, u.tipo, u.nome, u.descricao, u.parent_id, u.ativo, p.nome AS parent_nome,
        (SELECT COUNT(*) FROM memberships m WHERE m.unit_id = u.id AND (m.fim IS NULL OR m.fim > UTC_DATE())) AS integrantes
     FROM org_units u LEFT JOIN org_units p ON p.id = u.parent_id ${where} ORDER BY u.tipo, u.nome`,
    ids === "todas" ? [] : [ids],
  );
}

export async function getUnit(actor: number, id: number): Promise<Unit> {
  if (!(await can(actor, "estruturas", "ver", id))) throw new NotFoundError(); // não revela existência
  const r = await query<Unit & RowDataPacket>(
    `SELECT u.id, u.tipo, u.nome, u.descricao, u.parent_id, u.ativo, p.nome AS parent_nome
     FROM org_units u LEFT JOIN org_units p ON p.id = u.parent_id WHERE u.id = ?`, [id]);
  if (!r[0]) throw new NotFoundError();
  return r[0];
}

export async function createUnit(actor: number, d: { tipo: string; nome: string; descricao: string | null; parentId: number | null }) {
  await assertCan(actor, "estruturas", "criar", d.parentId); // sem pai: somente papel global
  if (d.parentId != null) {
    const p = await query<RowDataPacket>("SELECT ativo FROM org_units WHERE id = ?", [d.parentId]);
    if (!p[0] || !p[0].ativo) throw new DomainError("Estrutura superior inválida.");
  }
  const r = await execute("INSERT INTO org_units (tipo, nome, descricao, parent_id) VALUES (?, ?, ?, ?)",
    [d.tipo, d.nome, d.descricao, d.parentId]);
  await audit(actor, "estrutura.criar", { entidade: "org_unit", entidadeId: r.insertId, detalhes: d });
  return r.insertId;
}

export async function updateUnit(actor: number, id: number, d: { nome: string; descricao: string | null }) {
  await assertCan(actor, "estruturas", "editar", id);
  await execute("UPDATE org_units SET nome = ?, descricao = ? WHERE id = ?", [d.nome, d.descricao, id]);
  await audit(actor, "estrutura.editar", { entidade: "org_unit", entidadeId: id, detalhes: d });
}

export async function moveUnit(actor: number, id: number, newParent: number | null) {
  await assertCan(actor, "estruturas", "editar", id);
  await assertCan(actor, "estruturas", "criar", newParent);
  if (newParent === id) throw new DomainError("Uma estrutura não pode ser superior de si mesma.");
  if (newParent != null) {
    const ciclo = await query<RowDataPacket>(
      `WITH RECURSIVE sub AS (SELECT id FROM org_units WHERE id = ? UNION ALL SELECT o.id FROM org_units o JOIN sub s ON o.parent_id = s.id)
       SELECT 1 AS x FROM sub WHERE id = ?`, [id, newParent]);
    if (ciclo.length) throw new DomainError("Movimento criaria um ciclo na hierarquia.");
  }
  await execute("UPDATE org_units SET parent_id = ? WHERE id = ?", [newParent, id]);
  await audit(actor, "estrutura.mover", { entidade: "org_unit", entidadeId: id, detalhes: { newParent } });
}

/** Estruturas não são apagadas: são desativadas (preserva histórico). */
export async function deactivateUnit(actor: number, id: number) {
  await assertCan(actor, "estruturas", "excluir", id);
  const f = await query<RowDataPacket>("SELECT 1 AS x FROM org_units WHERE parent_id = ? AND ativo = 1 LIMIT 1", [id]);
  if (f.length) throw new DomainError("Desative primeiro as estruturas subordinadas.");
  await execute("UPDATE org_units SET ativo = 0 WHERE id = ?", [id]);
  await audit(actor, "estrutura.desativar", { entidade: "org_unit", entidadeId: id });
}

export type UnitMember = { membership_id: number; user_id: number; nome: string; email: string; funcao: string | null; inicio: Date; fim: Date | null };

export async function listUnitMembers(actor: number, unitId: number, incluirHistorico = false): Promise<UnitMember[]> {
  await assertCan(actor, "membros", "ver", unitId);
  return query<UnitMember & RowDataPacket>(
    `SELECT m.id AS membership_id, u.id AS user_id, u.nome, u.email, m.funcao, m.inicio, m.fim
     FROM memberships m JOIN users u ON u.id = m.user_id
     WHERE m.unit_id = ? ${incluirHistorico ? "" : "AND (m.fim IS NULL OR m.fim > UTC_DATE())"}
     ORDER BY m.fim IS NOT NULL, u.nome`, [unitId]);
}

async function activeMembership(userId: number, unitId: number) {
  const r = await query<RowDataPacket>(
    "SELECT id FROM memberships WHERE user_id = ? AND unit_id = ? AND (fim IS NULL OR fim > UTC_DATE()) LIMIT 1", [userId, unitId]);
  return r[0]?.id as number | undefined;
}

export async function addMember(actor: number, unitId: number, userId: number, funcao: string | null) {
  await assertCan(actor, "estruturas", "integrantes", unitId);
  const u = await query<RowDataPacket>("SELECT status FROM users WHERE id = ?", [userId]);
  if (!u[0] || u[0].status !== "ativo") throw new DomainError("Pessoa não encontrada ou inativa.");
  const un = await query<RowDataPacket>("SELECT ativo FROM org_units WHERE id = ?", [unitId]);
  if (!un[0]?.ativo) throw new DomainError("Estrutura inativa.");
  if (await activeMembership(userId, unitId)) throw new DomainError("A pessoa já é integrante desta estrutura.");
  const r = await execute("INSERT INTO memberships (user_id, unit_id, funcao, inicio) VALUES (?, ?, ?, UTC_DATE())", [userId, unitId, funcao]);
  await audit(actor, "vinculo.criar", { entidade: "membership", entidadeId: r.insertId, detalhes: { unitId, userId, funcao } });
}

export async function endMembership(actor: number, membershipId: number) {
  const m = await query<RowDataPacket>("SELECT unit_id, user_id FROM memberships WHERE id = ? AND fim IS NULL", [membershipId]);
  if (!m[0]) throw new NotFoundError();
  await assertCan(actor, "estruturas", "integrantes", m[0].unit_id);
  // fim é exclusivo: o acesso é revogado imediatamente.
  await execute("UPDATE memberships SET fim = UTC_DATE() WHERE id = ?", [membershipId]);
  await audit(actor, "vinculo.encerrar", { entidade: "membership", entidadeId: membershipId, detalhes: { unitId: m[0].unit_id, userId: m[0].user_id } });
}

export async function transferMember(actor: number, userId: number, fromUnit: number, toUnit: number, funcao: string | null) {
  if (fromUnit === toUnit) throw new DomainError("Origem e destino são iguais.");
  await assertCan(actor, "estruturas", "integrantes", fromUnit);
  await assertCan(actor, "estruturas", "integrantes", toUnit);
  await tx(async (c) => {
    const [cur] = await c.query<RowDataPacket[]>(
      "SELECT id FROM memberships WHERE user_id = ? AND unit_id = ? AND fim IS NULL FOR UPDATE", [userId, fromUnit]);
    if (!cur[0]) throw new DomainError("A pessoa não é integrante da estrutura de origem.");
    const [dest] = await c.query<RowDataPacket[]>(
      "SELECT id FROM memberships WHERE user_id = ? AND unit_id = ? AND (fim IS NULL OR fim > UTC_DATE()) LIMIT 1", [userId, toUnit]);
    if (dest[0]) throw new DomainError("A pessoa já integra a estrutura de destino.");
    await c.query("UPDATE memberships SET fim = UTC_DATE() WHERE id = ?", [cur[0].id]);
    await c.query("INSERT INTO memberships (user_id, unit_id, funcao, inicio) VALUES (?, ?, ?, UTC_DATE())", [userId, toUnit, funcao]);
  });
  await audit(actor, "vinculo.transferir", { entidade: "user", entidadeId: userId, detalhes: { fromUnit, toUnit } });
}
