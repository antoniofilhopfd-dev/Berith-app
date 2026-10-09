import type { RowDataPacket } from "mysql2/promise";
import { execute, query } from "@/lib/db";
import { verifyDummy, verifyPassword } from "./password";
import { audit } from "@/lib/services/audit";

export const MAX_FALHAS_EMAIL = 5;
export const MAX_FALHAS_IP = 20;
export const JANELA_MIN = 15;

export async function isBlocked(email: string, ip: string): Promise<boolean> {
  const r = await query<RowDataPacket>(
    `SELECT
       SUM(email = ?) AS por_email, SUM(ip = ?) AS por_ip
     FROM login_attempts
     WHERE sucesso = 0 AND criado_em > DATE_SUB(UTC_TIMESTAMP(), INTERVAL ${JANELA_MIN} MINUTE) AND (email = ? OR ip = ?)`,
    [email, ip, email, ip],
  );
  return Number(r[0]?.por_email ?? 0) >= MAX_FALHAS_EMAIL || Number(r[0]?.por_ip ?? 0) >= MAX_FALHAS_IP;
}

type UserRow = RowDataPacket & { id: number; senha_hash: string; status: string };

export type LoginResult = { ok: true; userId: number } | { ok: false; motivo: "bloqueado" | "credenciais" };

/** Verifica credenciais com limite de tentativas. Mensagens externas não distinguem causa. */
export async function authenticate(email: string, senha: string, ip: string): Promise<LoginResult> {
  if (await isBlocked(email, ip)) {
    await audit(null, "login.bloqueado", { ip, detalhes: { email } });
    return { ok: false, motivo: "bloqueado" };
  }
  const rows = await query<UserRow>("SELECT id, senha_hash, status FROM users WHERE email = ?", [email]);
  const user = rows[0];
  const valido = user ? await verifyPassword(senha, user.senha_hash) : (await verifyDummy(senha), false);
  const ok = Boolean(user && valido && user.status === "ativo");
  await execute("INSERT INTO login_attempts (email, ip, sucesso) VALUES (?, ?, ?)", [email, ip, ok ? 1 : 0]);
  if (!ok) {
    await audit(user?.id ?? null, "login.falha", { ip });
    return { ok: false, motivo: "credenciais" };
  }
  await audit(user!.id, "login.sucesso", { ip });
  return { ok: true, userId: user!.id };
}
