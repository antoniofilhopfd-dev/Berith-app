import { createHash, randomBytes } from "node:crypto";
import { cookies, headers } from "next/headers";
import type { RowDataPacket } from "mysql2/promise";
import { execute, query } from "@/lib/db";
import { SESSION_COOKIE, SESSION_DAYS } from "./constants";
import { ipDe } from "./ip";

export type SessionUser = { id: number; nome: string; email: string };

const sha256 = (v: string) => createHash("sha256").update(v).digest("hex");

export async function clientInfo() {
  const h = await headers();
  const ip = ipDe((n) => h.get(n));
  return { ip, userAgent: (h.get("user-agent") ?? "").slice(0, 255) };
}

/** Cria sessão no servidor e define o cookie. Só o hash do token fica no banco. */
export async function createSession(userId: number) {
  const token = randomBytes(32).toString("base64url");
  const { ip, userAgent } = await clientInfo();
  const expira = new Date(Date.now() + SESSION_DAYS * 86400_000);
  await execute("INSERT INTO sessions (user_id, token_hash, expira_em, ip, user_agent) VALUES (?, ?, ?, ?, ?)", [
    userId,
    sha256(token),
    expira,
    ip,
    userAgent,
  ]);
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expira,
  });
}

/** Valida a sessão a cada chamada (revogação e suspensão valem imediatamente). */
export async function getSessionUser(): Promise<SessionUser | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token || token.length > 100) return null;
  return userFromToken(token);
}

export async function userFromToken(token: string): Promise<SessionUser | null> {
  const rows = await query<RowDataPacket & SessionUser>(
    `SELECT u.id, u.nome, u.email FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = ? AND s.revogada_em IS NULL AND s.expira_em > UTC_TIMESTAMP() AND u.status = 'ativo'`,
    [sha256(token)],
  );
  return rows[0] ? { id: rows[0].id, nome: rows[0].nome, email: rows[0].email } : null;
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await execute("UPDATE sessions SET revogada_em = UTC_TIMESTAMP() WHERE token_hash = ?", [sha256(token)]);
  jar.delete(SESSION_COOKIE);
}

export async function revokeAllSessions(userId: number) {
  await execute("UPDATE sessions SET revogada_em = UTC_TIMESTAMP() WHERE user_id = ? AND revogada_em IS NULL", [userId]);
}

export async function requireUser(): Promise<SessionUser> {
  const u = await getSessionUser();
  if (!u) throw new AuthError("Sessão inválida ou expirada.");
  return u;
}

export class AuthError extends Error {}
export const __test = { sha256 };
