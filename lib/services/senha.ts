import type { RowDataPacket } from "mysql2/promise";
import { execute, query, tx } from "@/lib/db";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { assertCan } from "@/lib/permissions";
import { audit } from "./audit";
import { DomainError } from "./errors";
import { sendMail } from "./mailer";
import { hashToken, newToken } from "./tokens";

const VALIDADE_MIN = 60;
const MAX_POR_HORA = 3;

async function createReset(userId: number) {
  const token = newToken();
  await execute("UPDATE password_resets SET usado_em = UTC_TIMESTAMP() WHERE user_id = ? AND usado_em IS NULL", [userId]);
  await execute("INSERT INTO password_resets (user_id, token_hash, expira_em) VALUES (?, ?, DATE_ADD(UTC_TIMESTAMP(), INTERVAL ? MINUTE))",
    [userId, hashToken(token), VALIDADE_MIN]);
  return token;
}

/**
 * Pedido público. A resposta é sempre a mesma (não revela se o e-mail existe).
 * O e-mail só sai se o SMTP estiver configurado; caso contrário, a coordenação gera o link manualmente.
 */
export async function requestPasswordReset(email: string, baseUrl: string, ip: string | null) {
  const u = await query<RowDataPacket>("SELECT id, nome FROM users WHERE email = ? AND status = 'ativo'", [email]);
  if (!u[0]) return;
  const recentes = await query<RowDataPacket>(
    "SELECT COUNT(*) AS n FROM password_resets WHERE user_id = ? AND criado_em > DATE_SUB(UTC_TIMESTAMP(), INTERVAL 1 HOUR)", [u[0].id]);
  if (Number(recentes[0].n) >= MAX_POR_HORA) return;
  const token = await createReset(u[0].id);
  await audit(u[0].id, "senha.solicitar_redefinicao", { ip });
  await sendMail(email, "Berith — redefinição de senha",
    `Olá, ${u[0].nome}.\n\nPara criar uma nova senha, acesse (válido por ${VALIDADE_MIN} minutos):\n${baseUrl}/redefinir-senha/${token}\n\nSe você não pediu, ignore esta mensagem.`);
}

/** Link gerado por um administrador para entregar ao membro por canal seguro. */
export async function adminCreateReset(actor: number, userId: number) {
  await assertCan(actor, "equipe", "gerir");
  const token = await createReset(userId);
  await audit(actor, "senha.gerar_link", { entidade: "user", entidadeId: userId });
  return token;
}

export async function isResetTokenValid(token: string) {
  if (!token || token.length > 100) return false;
  const r = await query<RowDataPacket>(
    "SELECT 1 AS x FROM password_resets WHERE token_hash = ? AND usado_em IS NULL AND expira_em > UTC_TIMESTAMP()", [hashToken(token)]);
  return r.length > 0;
}

export async function resetPassword(token: string, novaSenha: string, ip: string | null) {
  const hash = await hashPassword(novaSenha);
  const userId = await tx(async (c) => {
    const [rows] = await c.query<RowDataPacket[]>(
      "SELECT id, user_id FROM password_resets WHERE token_hash = ? AND usado_em IS NULL AND expira_em > UTC_TIMESTAMP() FOR UPDATE", [hashToken(token)]);
    if (!rows[0]) throw new DomainError("Link inválido ou expirado.");
    await c.query("UPDATE password_resets SET usado_em = UTC_TIMESTAMP() WHERE id = ?", [rows[0].id]);
    await c.query("UPDATE users SET senha_hash = ? WHERE id = ?", [hash, rows[0].user_id]);
    await c.query("UPDATE sessions SET revogada_em = UTC_TIMESTAMP() WHERE user_id = ? AND revogada_em IS NULL", [rows[0].user_id]);
    return rows[0].user_id as number;
  });
  await audit(userId, "senha.redefinir", { ip });
}

/** Troca a própria senha exigindo a atual; encerra todas as sessões (quem trocou entra de novo com a nova). */
export async function trocarSenha(userId: number, atual: string, nova: string) {
  const u = await query<RowDataPacket>("SELECT senha_hash FROM users WHERE id = ? AND status = 'ativo'", [userId]);
  if (!u[0] || !(await verifyPassword(atual, u[0].senha_hash as string))) {
    await audit(userId, "senha.trocar_falhou");
    throw new DomainError("A senha atual está incorreta.");
  }
  if (atual === nova) throw new DomainError("A nova senha deve ser diferente da atual.");
  await execute("UPDATE users SET senha_hash = ? WHERE id = ?", [await hashPassword(nova), userId]);
  await execute("UPDATE sessions SET revogada_em = UTC_TIMESTAMP() WHERE user_id = ? AND revogada_em IS NULL", [userId]);
  await audit(userId, "senha.trocar");
}

export type SessaoAtiva = { id: number; ip: string | null; user_agent: string | null; criado_em: Date; expira_em: Date; atual: boolean };
export async function sessoesDoUsuario(userId: number, hashAtual: string | null): Promise<SessaoAtiva[]> {
  const r = await query<RowDataPacket>(
    "SELECT id, ip, user_agent, criado_em, expira_em, token_hash FROM sessions WHERE user_id = ? AND revogada_em IS NULL AND expira_em > UTC_TIMESTAMP() ORDER BY id DESC LIMIT 20", [userId]);
  return r.map((x) => ({ id: Number(x.id), ip: x.ip, user_agent: x.user_agent, criado_em: x.criado_em, expira_em: x.expira_em, atual: x.token_hash === hashAtual }));
}
export async function encerrarSessao(userId: number, sessaoId: number) {
  await execute("UPDATE sessions SET revogada_em = UTC_TIMESTAMP() WHERE id = ? AND user_id = ? AND revogada_em IS NULL", [sessaoId, userId]);
  await audit(userId, "sessao.encerrar", { entidade: "sessao", entidadeId: sessaoId });
}
export async function encerrarOutrasSessoes(userId: number, hashAtual: string | null) {
  await execute("UPDATE sessions SET revogada_em = UTC_TIMESTAMP() WHERE user_id = ? AND revogada_em IS NULL AND token_hash <> ?", [userId, hashAtual ?? ""]);
  await audit(userId, "sessao.encerrar_outras");
}
