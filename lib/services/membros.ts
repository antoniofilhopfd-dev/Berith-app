import type { RowDataPacket } from "mysql2/promise";
import { execute, query, tx } from "@/lib/db";
import { accessibleUnitIds, assertCan, can } from "@/lib/permissions";
import { hashPassword } from "@/lib/auth/password";
import { audit } from "./audit";
import { DomainError, NotFoundError } from "./errors";
import { hashToken, newToken } from "./tokens";

const CONVITE_DIAS = 7;
export const PAGE_SIZE = 20;

export type Pessoa = { id: number; nome: string; email: string; status: string; telefone: string | null; situacao: string | null };

/** Pessoas que o usuário pode ver: integrantes das estruturas autorizadas (ou todas, para papel global). */
export async function listPeople(actor: number, opts: { q?: string; page?: number } = {}): Promise<{ itens: Pessoa[]; total: number }> {
  const ids = await accessibleUnitIds(actor, "membros", "ver");
  if (ids !== "todas" && ids.length === 0) return { itens: [], total: 0 };
  const page = Math.max(1, opts.page ?? 1);
  const like = opts.q ? `%${opts.q.replace(/[%_\\]/g, "\\$&")}%` : null;
  const filtro = like ? "AND (u.nome LIKE ? OR u.email LIKE ?)" : "";
  const fparams = like ? [like, like] : [];
  const from = ids === "todas"
    ? `FROM users u LEFT JOIN member_profiles p ON p.user_id = u.id WHERE u.status <> 'pendente' ${filtro}`
    : `FROM users u LEFT JOIN member_profiles p ON p.user_id = u.id
       WHERE u.status <> 'pendente' ${filtro} AND EXISTS (
         SELECT 1 FROM memberships m WHERE m.user_id = u.id AND m.unit_id IN (?) AND (m.fim IS NULL OR m.fim > UTC_DATE()))`;
  const params = ids === "todas" ? fparams : [...fparams, ids];
  const total = await query<RowDataPacket>(`SELECT COUNT(*) AS n ${from}`, params);
  const itens = await query<Pessoa & RowDataPacket>(
    `SELECT u.id, u.nome, u.email, u.status, p.telefone, p.situacao ${from} ORDER BY u.nome LIMIT ? OFFSET ?`,
    [...params, PAGE_SIZE, (page - 1) * PAGE_SIZE]);
  return { itens, total: Number(total[0].n) };
}

/** A pessoa só é visível a quem compartilha uma estrutura em que tem permissão de ver membros (ou é global). */
export async function canViewPerson(actor: number, personId: number): Promise<boolean> {
  if (actor === personId) return true;
  if (await can(actor, "membros", "ver")) return true;
  const ids = await accessibleUnitIds(actor, "membros", "ver");
  if (ids === "todas" || ids.length === 0) return ids === "todas";
  const r = await query<RowDataPacket>(
    `SELECT 1 AS x FROM memberships WHERE user_id = ? AND unit_id IN (?) AND (fim IS NULL OR fim > UTC_DATE()) LIMIT 1`, [personId, ids]);
  return r.length > 0;
}

export async function getPerson(actor: number, personId: number) {
  if (!(await canViewPerson(actor, personId))) throw new NotFoundError();
  const u = await query<Pessoa & RowDataPacket>(
    `SELECT u.id, u.nome, u.email, u.status, p.telefone, p.situacao FROM users u LEFT JOIN member_profiles p ON p.user_id = u.id WHERE u.id = ?`, [personId]);
  if (!u[0]) throw new NotFoundError();
  // Vínculos: só os de estruturas que o ator pode ver (ou os próprios).
  const ids = actor === personId ? "todas" : await accessibleUnitIds(actor, "membros", "ver");
  const vinculos = ids !== "todas" && ids.length === 0 ? [] : await query<RowDataPacket>(
    `SELECT m.id, o.id AS unit_id, o.nome, o.tipo, m.funcao, m.inicio, m.fim FROM memberships m JOIN org_units o ON o.id = m.unit_id
     WHERE m.user_id = ? ${ids === "todas" ? "" : "AND m.unit_id IN (?)"} ORDER BY m.fim IS NOT NULL, o.nome`,
    ids === "todas" ? [personId] : [personId, ids]);
  const papeis = (await can(actor, "membros", "permissoes")) ? await query<RowDataPacket>(
    `SELECT ur.id, r.codigo, r.nome, r.e_global, o.id AS unit_id, o.nome AS unit_nome FROM user_roles ur JOIN roles r ON r.id = ur.role_id
     LEFT JOIN org_units o ON o.id = ur.scope_unit_id WHERE ur.user_id = ? ORDER BY r.nome`, [personId]) : [];
  return { pessoa: u[0], vinculos, papeis };
}

export async function updateOwnProfile(userId: number, d: { telefone: string | null }) {
  await execute(
    `INSERT INTO member_profiles (user_id, telefone) VALUES (?, ?) ON DUPLICATE KEY UPDATE telefone = VALUES(telefone)`, [userId, d.telefone]);
  await audit(userId, "perfil.atualizar", { entidade: "user", entidadeId: userId });
}

/* -------- Convites e aprovação -------- */

export async function createInvitation(actor: number, d: { nome: string; email: string; unitId: number | null; funcao: string | null }) {
  await assertCan(actor, "membros", "criar", d.unitId); // sem estrutura: só papel global
  const ja = await query<RowDataPacket>("SELECT 1 AS x FROM users WHERE email = ?", [d.email]);
  if (ja.length) throw new DomainError("Já existe uma pessoa cadastrada com este e-mail.");
  const token = newToken();
  const expira = new Date(Date.now() + CONVITE_DIAS * 86400_000);
  const id = await tx(async (c) => {
    await c.query("UPDATE invitations SET expira_em = UTC_TIMESTAMP() WHERE email = ? AND aceito_em IS NULL", [d.email]); // invalida anteriores
    const [r] = await c.query<import("mysql2/promise").ResultSetHeader>(
      "INSERT INTO invitations (email, nome, token_hash, convidado_por, expira_em) VALUES (?, ?, ?, ?, ?)",
      [d.email, d.nome, hashToken(token), actor, expira]);
    if (d.unitId != null) await c.query("INSERT INTO invitation_units (invitation_id, unit_id, funcao) VALUES (?, ?, ?)", [r.insertId, d.unitId, d.funcao]);
    return r.insertId;
  });
  await audit(actor, "convite.criar", { entidade: "invitation", entidadeId: id, detalhes: { email: d.email, unitId: d.unitId } });
  return { id, token, expira };
}

type InviteRow = RowDataPacket & { id: number; nome: string; email: string };

export async function getValidInvitation(token: string): Promise<{ id: number; nome: string; email: string } | null> {
  if (!token || token.length > 100) return null;
  const r = await query<InviteRow>(
    "SELECT id, nome, email FROM invitations WHERE token_hash = ? AND aceito_em IS NULL AND expira_em > UTC_TIMESTAMP()", [hashToken(token)]);
  return r[0] ? { id: r[0].id, nome: r[0].nome, email: r[0].email } : null;
}

/** Aceite cria o usuário como PENDENTE: o acesso só vem depois da aprovação. */
export async function acceptInvitation(token: string, senha: string, ip: string | null) {
  const inv = await getValidInvitation(token);
  if (!inv) throw new DomainError("Convite inválido ou expirado.");
  const hash = await hashPassword(senha);
  const userId = await tx(async (c) => {
    const [claim] = await c.query<import("mysql2/promise").ResultSetHeader>(
      "UPDATE invitations SET aceito_em = UTC_TIMESTAMP() WHERE id = ? AND aceito_em IS NULL", [inv.id]);
    if (claim.affectedRows !== 1) throw new DomainError("Convite inválido ou expirado.");
    const [u] = await c.query<import("mysql2/promise").ResultSetHeader>(
      "INSERT INTO users (nome, email, senha_hash, status) VALUES (?, ?, ?, 'pendente')", [inv.nome, inv.email, hash]);
    await c.query("INSERT INTO user_invitation (user_id, invitation_id) VALUES (?, ?)", [u.insertId, inv.id]);
    return u.insertId;
  });
  await audit(userId, "convite.aceitar", { entidade: "invitation", entidadeId: inv.id, ip });
  return userId;
}

export type Pendente = { id: number; nome: string; email: string; criado_em: Date; estruturas: string | null };

/** Pendentes que o ator pode aprovar: convite com estrutura dentro do seu escopo (ou global para aprovações sem estrutura). */
export async function listPending(actor: number): Promise<Pendente[]> {
  const ids = await accessibleUnitIds(actor, "membros", "aprovar");
  if (ids !== "todas" && ids.length === 0) return [];
  const filtro = ids === "todas" ? "" : "AND EXISTS (SELECT 1 FROM invitation_units x WHERE x.invitation_id = ui.invitation_id AND x.unit_id IN (?))";
  return query<Pendente & RowDataPacket>(
    `SELECT u.id, u.nome, u.email, u.criado_em,
       (SELECT GROUP_CONCAT(o.nome ORDER BY o.nome SEPARATOR ', ') FROM invitation_units iu JOIN org_units o ON o.id = iu.unit_id WHERE iu.invitation_id = ui.invitation_id) AS estruturas
     FROM users u JOIN user_invitation ui ON ui.user_id = u.id WHERE u.status = 'pendente' ${filtro} ORDER BY u.criado_em`,
    ids === "todas" ? [] : [ids]);
}

async function assertCanDecide(actor: number, userId: number) {
  const r = await query<RowDataPacket>(
    `SELECT u.status, ui.invitation_id FROM users u JOIN user_invitation ui ON ui.user_id = u.id WHERE u.id = ?`, [userId]);
  if (!r[0] || r[0].status !== "pendente") throw new NotFoundError();
  const units = await query<RowDataPacket>("SELECT unit_id, funcao FROM invitation_units WHERE invitation_id = ?", [r[0].invitation_id]);
  if (units.length === 0) await assertCan(actor, "membros", "aprovar", null);
  else if (!(await Promise.all(units.map((u) => can(actor, "membros", "aprovar", u.unit_id)))).some(Boolean)) throw new NotFoundError();
  return { units, invitationId: r[0].invitation_id as number };
}

export async function approveUser(actor: number, userId: number) {
  const { units } = await assertCanDecide(actor, userId);
  await tx(async (c) => {
    await c.query("UPDATE users SET status = 'ativo' WHERE id = ? AND status = 'pendente'", [userId]);
    await c.query("INSERT IGNORE INTO member_profiles (user_id) VALUES (?)", [userId]);
    for (const u of units) {
      await c.query("INSERT INTO memberships (user_id, unit_id, funcao, inicio) VALUES (?, ?, ?, UTC_DATE())", [userId, u.unit_id, u.funcao]);
    }
  });
  await audit(actor, "membro.aprovar", { entidade: "user", entidadeId: userId });
}

export async function rejectUser(actor: number, userId: number) {
  await assertCanDecide(actor, userId);
  await execute("UPDATE users SET status = 'suspenso' WHERE id = ? AND status = 'pendente'", [userId]);
  await audit(actor, "membro.rejeitar", { entidade: "user", entidadeId: userId });
}

/** Suspensão/reativação: somente papel global com permissão de gerir permissões de membros. */
export async function setUserStatus(actor: number, userId: number, status: "ativo" | "suspenso") {
  await assertCan(actor, "membros", "permissoes", null);
  if (actor === userId) throw new DomainError("Você não pode alterar a própria situação.");
  await execute("UPDATE users SET status = ? WHERE id = ? AND status <> 'pendente'", [status, userId]);
  if (status === "suspenso") await execute("UPDATE sessions SET revogada_em = UTC_TIMESTAMP() WHERE user_id = ? AND revogada_em IS NULL", [userId]);
  await audit(actor, `membro.${status === "ativo" ? "reativar" : "suspender"}`, { entidade: "user", entidadeId: userId });
}
