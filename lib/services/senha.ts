import type { RowDataPacket } from "mysql2/promise";
import { execute, query, tx } from "@/lib/db";
import { hashPassword } from "@/lib/auth/password";
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
  await sendMail(email, "Nova Berith — redefinição de senha",
    `Olá, ${u[0].nome}.\n\nPara criar uma nova senha, acesse (válido por ${VALIDADE_MIN} minutos):\n${baseUrl}/redefinir-senha/${token}\n\nSe você não pediu, ignore esta mensagem.`);
}

/** Link gerado por um administrador para entregar ao membro por canal seguro. */
export async function adminCreateReset(actor: number, userId: number) {
  await assertCan(actor, "membros", "permissoes", null);
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
