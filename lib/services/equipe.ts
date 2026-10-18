import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { execute, query, tx } from "@/lib/db";
import { assertCan, PERFIS, type Perfil } from "@/lib/permissions";
import { hashPassword } from "@/lib/auth/password";
import { audit } from "./audit";
import { DomainError, NotFoundError } from "./errors";
import { hashToken, newToken } from "./tokens";

const CONVITE_DIAS = 7;

export type Integrante = {
  id: number; nome: string; email: string; status: string; telefone: string | null; perfil: Perfil | null; criado_em: Date;
};

export function perfilValido(p: string): p is Perfil {
  return (PERFIS as readonly string[]).includes(p);
}

/** Pessoas ativas/suspensas da equipe, com o perfil atual. Quem tem "equipe: ver" enxerga a equipe toda. */
export async function listarEquipe(actor: number): Promise<Integrante[]> {
  await assertCan(actor, "equipe", "ver");
  return query<Integrante & RowDataPacket>(
    `SELECT u.id, u.nome, u.email, u.status, p.telefone, u.criado_em,
       (SELECT r.codigo FROM user_roles ur JOIN roles r ON r.id = ur.role_id
         WHERE ur.user_id = u.id AND r.codigo IN (?) AND ur.scope_unit_id IS NULL LIMIT 1) AS perfil
     FROM users u LEFT JOIN member_profiles p ON p.user_id = u.id
     WHERE u.status <> 'pendente' ORDER BY u.status = 'ativo' DESC, u.nome`,
    [PERFIS as unknown as string[]]);
}

export async function meusDados(userId: number) {
  const r = await query<RowDataPacket>(
    `SELECT u.id, u.nome, u.email, p.telefone FROM users u LEFT JOIN member_profiles p ON p.user_id = u.id WHERE u.id = ?`, [userId]);
  if (!r[0]) throw new NotFoundError();
  return { id: r[0].id as number, nome: r[0].nome as string, email: r[0].email as string, telefone: (r[0].telefone as string | null) ?? null };
}

export async function atualizarPerfil(userId: number, d: { nome: string; telefone: string | null }) {
  await execute("UPDATE users SET nome = ? WHERE id = ?", [d.nome, userId]);
  await execute(`INSERT INTO member_profiles (user_id, telefone) VALUES (?, ?) ON DUPLICATE KEY UPDATE telefone = VALUES(telefone)`, [userId, d.telefone]);
  await audit(userId, "perfil.atualizar", { entidade: "user", entidadeId: userId });
}

/** Um único perfil por pessoa. Nunca deixa o app sem administrador. */
export async function definirPerfil(actor: number, userId: number, perfil: Perfil | "nenhum") {
  await assertCan(actor, "equipe", "gerir");
  if (perfil !== "nenhum" && !perfilValido(perfil)) throw new DomainError("Perfil inexistente.");
  const u = await query<RowDataPacket>("SELECT status FROM users WHERE id = ?", [userId]);
  if (!u[0] || u[0].status === "pendente") throw new NotFoundError();
  const atual = await query<RowDataPacket>(
    `SELECT r.codigo FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = ? AND r.codigo IN (?) AND ur.scope_unit_id IS NULL`,
    [userId, PERFIS as unknown as string[]]);
  if (atual.some((x) => x.codigo === "admin") && perfil !== "admin") {
    const n = await query<RowDataPacket>(
      `SELECT COUNT(DISTINCT ur.user_id) n FROM user_roles ur JOIN roles r ON r.id = ur.role_id AND r.codigo = 'admin' JOIN users x ON x.id = ur.user_id AND x.status = 'ativo'`);
    if (Number(n[0].n) <= 1) throw new DomainError("Não é possível remover o último administrador.");
  }
  await tx(async (c) => {
    await c.query(
      `DELETE ur FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = ? AND r.codigo IN (?) AND ur.scope_unit_id IS NULL`,
      [userId, PERFIS as unknown as string[]]);
    if (perfil !== "nenhum") {
      await c.query(
        "INSERT INTO user_roles (user_id, role_id, scope_unit_id, scope_unit_id_key) SELECT ?, id, NULL, 0 FROM roles WHERE codigo = ?", [userId, perfil]);
    }
  });
  await audit(actor, "equipe.perfil", { entidade: "user", entidadeId: userId, detalhes: { perfil } });
}

export async function alterarSituacao(actor: number, userId: number, status: "ativo" | "suspenso") {
  await assertCan(actor, "equipe", "gerir");
  if (actor === userId) throw new DomainError("Você não pode alterar a própria situação.");
  if (status === "suspenso") {
    const adm = await query<RowDataPacket>(
      `SELECT COUNT(DISTINCT ur.user_id) n FROM user_roles ur JOIN roles r ON r.id = ur.role_id AND r.codigo = 'admin' JOIN users x ON x.id = ur.user_id AND x.status = 'ativo' WHERE ur.user_id <> ?`, [userId]);
    const eAdmin = await query<RowDataPacket>(`SELECT 1 x FROM user_roles ur JOIN roles r ON r.id = ur.role_id AND r.codigo = 'admin' WHERE ur.user_id = ?`, [userId]);
    if (eAdmin.length && Number(adm[0].n) < 1) throw new DomainError("Não é possível suspender o último administrador.");
  }
  await execute("UPDATE users SET status = ? WHERE id = ? AND status <> 'pendente'", [status, userId]);
  if (status === "suspenso") await execute("UPDATE sessions SET revogada_em = UTC_TIMESTAMP() WHERE user_id = ? AND revogada_em IS NULL", [userId]);
  await audit(actor, `equipe.${status === "ativo" ? "reativar" : "suspender"}`, { entidade: "user", entidadeId: userId });
}

/* -------- Convites e aprovação -------- */
export async function criarConvite(actor: number, d: { nome: string; email: string; perfil: Perfil }) {
  await assertCan(actor, "equipe", "gerir");
  if (!perfilValido(d.perfil)) throw new DomainError("Perfil inexistente.");
  const ja = await query<RowDataPacket>("SELECT 1 AS x FROM users WHERE email = ?", [d.email]);
  if (ja.length) throw new DomainError("Já existe uma pessoa cadastrada com este e-mail.");
  const token = newToken();
  const expira = new Date(Date.now() + CONVITE_DIAS * 86400_000);
  const id = await tx(async (c) => {
    await c.query("UPDATE invitations SET expira_em = UTC_TIMESTAMP() WHERE email = ? AND aceito_em IS NULL", [d.email]);
    const [r] = await c.query<ResultSetHeader>(
      "INSERT INTO invitations (email, nome, token_hash, convidado_por, expira_em) VALUES (?, ?, ?, ?, ?)", [d.email, d.nome, hashToken(token), actor, expira]);
    await c.query("INSERT INTO invitation_roles (invitation_id, role_codigo) VALUES (?, ?)", [r.insertId, d.perfil]);
    return r.insertId;
  });
  await audit(actor, "convite.criar", { entidade: "invitation", entidadeId: id, detalhes: { email: d.email, perfil: d.perfil } });
  return { id, token, expira };
}

export async function getValidInvitation(token: string): Promise<{ id: number; nome: string; email: string } | null> {
  if (!token || token.length > 100) return null;
  const r = await query<RowDataPacket>(
    "SELECT id, nome, email FROM invitations WHERE token_hash = ? AND aceito_em IS NULL AND expira_em > UTC_TIMESTAMP()", [hashToken(token)]);
  return r[0] ? { id: r[0].id, nome: r[0].nome, email: r[0].email } : null;
}

/** Aceite cria o usuário como PENDENTE: o acesso só vem depois da aprovação do administrador. */
export async function acceptInvitation(token: string, senha: string, ip: string | null) {
  const inv = await getValidInvitation(token);
  if (!inv) throw new DomainError("Convite inválido ou expirado.");
  const hash = await hashPassword(senha);
  const userId = await tx(async (c) => {
    const [claim] = await c.query<ResultSetHeader>("UPDATE invitations SET aceito_em = UTC_TIMESTAMP() WHERE id = ? AND aceito_em IS NULL", [inv.id]);
    if (claim.affectedRows !== 1) throw new DomainError("Convite inválido ou expirado.");
    const [u] = await c.query<ResultSetHeader>("INSERT INTO users (nome, email, senha_hash, status) VALUES (?, ?, ?, 'pendente')", [inv.nome, inv.email, hash]);
    await c.query("INSERT INTO user_invitation (user_id, invitation_id) VALUES (?, ?)", [u.insertId, inv.id]);
    return u.insertId;
  });
  await audit(userId, "convite.aceitar", { entidade: "invitation", entidadeId: inv.id, ip });
  return userId;
}

export type Pendente = { id: number; nome: string; email: string; criado_em: Date; perfil: string | null };

export async function listarPendentes(actor: number): Promise<Pendente[]> {
  await assertCan(actor, "equipe", "gerir");
  return query<Pendente & RowDataPacket>(
    `SELECT u.id, u.nome, u.email, u.criado_em, ir.role_codigo AS perfil
     FROM users u JOIN user_invitation ui ON ui.user_id = u.id LEFT JOIN invitation_roles ir ON ir.invitation_id = ui.invitation_id
     WHERE u.status = 'pendente' ORDER BY u.criado_em`);
}

export async function aprovarPessoa(actor: number, userId: number) {
  await assertCan(actor, "equipe", "gerir");
  const r = await query<RowDataPacket>(
    `SELECT u.status, ir.role_codigo FROM users u JOIN user_invitation ui ON ui.user_id = u.id LEFT JOIN invitation_roles ir ON ir.invitation_id = ui.invitation_id WHERE u.id = ?`, [userId]);
  if (!r[0] || r[0].status !== "pendente") throw new NotFoundError();
  await tx(async (c) => {
    await c.query("UPDATE users SET status = 'ativo' WHERE id = ? AND status = 'pendente'", [userId]);
    await c.query("INSERT IGNORE INTO member_profiles (user_id) VALUES (?)", [userId]);
    if (r[0].role_codigo && perfilValido(r[0].role_codigo)) {
      await c.query("INSERT IGNORE INTO user_roles (user_id, role_id, scope_unit_id, scope_unit_id_key) SELECT ?, id, NULL, 0 FROM roles WHERE codigo = ?", [userId, r[0].role_codigo]);
    }
  });
  await audit(actor, "equipe.aprovar", { entidade: "user", entidadeId: userId, detalhes: { perfil: r[0].role_codigo } });
}

export async function rejeitarPessoa(actor: number, userId: number) {
  await assertCan(actor, "equipe", "gerir");
  const r = await query<RowDataPacket>("SELECT status FROM users WHERE id = ?", [userId]);
  if (!r[0] || r[0].status !== "pendente") throw new NotFoundError();
  await execute("UPDATE users SET status = 'suspenso' WHERE id = ? AND status = 'pendente'", [userId]);
  await audit(actor, "equipe.rejeitar", { entidade: "user", entidadeId: userId });
}

/** Carga de trabalho por pessoa (produções em aberto por situação). Para coordenação acompanhar a equipe. */
export async function cargaDaEquipe(actor: number): Promise<Map<number, { aberto: number; revisao: number; ajustes: number; atrasadas: number; publicadasMes: number }>> {
  await assertCan(actor, "equipe", "ver");
  const r = await query<RowDataPacket>(
    `SELECT responsavel_id AS id,
       SUM(status IN ('rascunho','em_producao')) AS aberto, SUM(status = 'em_revisao') AS revisao, SUM(status = 'ajustes_solicitados') AS ajustes,
       SUM(status IN ('rascunho','em_producao','ajustes_solicitados') AND prazo IS NOT NULL AND prazo < UTC_TIMESTAMP()) AS atrasadas,
       SUM(status = 'publicado' AND atualizado_em >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL 30 DAY)) AS publicadas
     FROM publicacoes WHERE responsavel_id IS NOT NULL GROUP BY responsavel_id`);
  return new Map(r.map((x) => [Number(x.id), { aberto: Number(x.aberto), revisao: Number(x.revisao), ajustes: Number(x.ajustes), atrasadas: Number(x.atrasadas), publicadasMes: Number(x.publicadas) }]));
}
