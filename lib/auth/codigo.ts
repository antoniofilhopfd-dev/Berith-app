import { createHmac, randomInt } from "node:crypto";
import type { RowDataPacket } from "mysql2/promise";
import { execute, query } from "@/lib/db";
import { assertCan } from "@/lib/permissions";
import { audit } from "@/lib/services/audit";
import { DomainError, NotFoundError } from "@/lib/services/errors";
import { getSetting, setSetting } from "@/lib/services/configuracoes";

/**
 * Código de acesso: 8 caracteres (sem 0/O/1/I/L), mostrados como XXXX-XXXX → 32^8 ≈ 1,1 trilhão de combinações.
 * No banco fica só o HMAC (chave = SESSION_SECRET): o código não pode ser recuperado, apenas substituído por outro.
 * Trocar o SESSION_SECRET invalida todos os códigos (gere novos em Equipe).
 */
const ALFABETO = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
export const TAMANHO = 8;
export const MAX_FALHAS_IP_CODIGO = 8;
export const MAX_FALHAS_GLOBAL_CODIGO = 300;
export const JANELA_MIN = 15;
const MARCA = "(código)"; // vai na coluna e-mail de login_attempts

export type ModoLogin = "codigo" | "ambos";
export async function modoLogin(): Promise<ModoLogin> { return (await getSetting("login_modo", "ambos")) === "codigo" ? "codigo" : "ambos"; }

export const formatarCodigo = (c: string) => `${c.slice(0, 4)}-${c.slice(4)}`;
/** Aceita minúsculas, espaços e hífen; devolve o código normalizado ou null se não tiver o formato. */
export function normalizarCodigo(entrada: string): string | null {
  const c = entrada.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return c.length === TAMANHO && [...c].every((ch) => ALFABETO.includes(ch)) ? c : null;
}
export function gerarCodigo(): string { return Array.from({ length: TAMANHO }, () => ALFABETO[randomInt(ALFABETO.length)]).join(""); }
export function hmacCodigo(codigo: string): string {
  const segredo = process.env.SESSION_SECRET;
  if (!segredo || segredo.length < 32) throw new Error("SESSION_SECRET ausente ou curto demais.");
  return createHmac("sha256", segredo).update("acesso-v1:" + codigo).digest("hex");
}

/** Gera (ou troca) o código de acesso de uma pessoa. Encerra as sessões dela. O código só é devolvido aqui. */
export async function emitirCodigo(actor: number, userId: number): Promise<{ codigo: string; nome: string }> {
  await assertCan(actor, "equipe", "gerir");
  const u = (await query<RowDataPacket>("SELECT id, nome, status FROM users WHERE id = ?", [userId]))[0];
  if (!u) throw new NotFoundError();
  if (u.status !== "ativo") throw new DomainError("Só pessoas ativas recebem código de acesso.");
  for (let i = 0; i < 20; i++) {
    const codigo = gerarCodigo();
    try {
      await execute("UPDATE users SET acesso_hmac = ?, acesso_gerado_em = UTC_TIMESTAMP() WHERE id = ?", [hmacCodigo(codigo), userId]);
    } catch (e) {
      if ((e as { code?: string }).code === "ER_DUP_ENTRY") continue; // colisão (praticamente impossível): sorteia outro
      throw e;
    }
    await execute("UPDATE sessions SET revogada_em = UTC_TIMESTAMP() WHERE user_id = ? AND revogada_em IS NULL", [userId]);
    await audit(actor, "acesso.codigo_gerado", { entidade: "user", entidadeId: String(userId) });
    return { codigo: formatarCodigo(codigo), nome: String(u.nome) };
  }
  throw new Error("Não foi possível gerar um código único.");
}

export async function revogarCodigo(actor: number, userId: number) {
  await assertCan(actor, "equipe", "gerir");
  await execute("UPDATE users SET acesso_hmac = NULL, acesso_gerado_em = NULL WHERE id = ?", [userId]);
  await execute("UPDATE sessions SET revogada_em = UTC_TIMESTAMP() WHERE user_id = ? AND revogada_em IS NULL", [userId]);
  await audit(actor, "acesso.codigo_revogado", { entidade: "user", entidadeId: String(userId) });
}

async function bloqueado(ip: string): Promise<{ porIp: number; global: number }> {
  const r = await query<RowDataPacket>(
    `SELECT SUM(ip = ?) AS por_ip, COUNT(*) AS total FROM login_attempts WHERE sucesso = 0 AND email = ? AND criado_em > DATE_SUB(UTC_TIMESTAMP(), INTERVAL ${JANELA_MIN} MINUTE)`, [ip, MARCA]);
  return { porIp: Number(r[0]?.por_ip ?? 0), global: Number(r[0]?.total ?? 0) };
}

export type ResultadoCodigo = { ok: true; userId: number } | { ok: false; motivo: "bloqueado" | "codigo" };

/** Entrada por código, com limite de tentativas por endereço e global e atraso crescente. A resposta não revela o motivo da recusa. */
export async function autenticarCodigo(entrada: string, ip: string, espera = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))): Promise<ResultadoCodigo> {
  const f = await bloqueado(ip);
  if (f.porIp >= MAX_FALHAS_IP_CODIGO || f.global >= MAX_FALHAS_GLOBAL_CODIGO) {
    await audit(null, "login.bloqueado", { ip, detalhes: { via: "codigo" } });
    return { ok: false, motivo: "bloqueado" };
  }
  if (f.porIp > 0) await espera(Math.min(f.porIp, 5) * 300);
  const codigo = normalizarCodigo(entrada);
  const u = codigo ? (await query<RowDataPacket>("SELECT id, status FROM users WHERE acesso_hmac = ?", [hmacCodigo(codigo)]))[0] : undefined;
  const ok = Boolean(u && u.status === "ativo");
  await execute("INSERT INTO login_attempts (email, ip, sucesso) VALUES (?, ?, ?)", [MARCA, ip, ok ? 1 : 0]);
  if (!ok) { await audit(u ? Number(u.id) : null, "login.falha", { ip, detalhes: { via: "codigo" } }); return { ok: false, motivo: "codigo" }; }
  await audit(Number(u!.id), "login.sucesso", { ip, detalhes: { via: "codigo" } });
  return { ok: true, userId: Number(u!.id) };
}

/** Define se a entrada é só por código ou também por e-mail/senha. Para "codigo", quem altera precisa já ter o próprio código (evita se trancar fora). */
export async function definirModoLogin(actor: number, modo: ModoLogin) {
  await assertCan(actor, "configuracoes", "gerir");
  if (modo === "codigo") {
    const eu = (await query<RowDataPacket>("SELECT acesso_hmac FROM users WHERE id = ?", [actor]))[0];
    if (!eu?.acesso_hmac) throw new DomainError("Gere o seu próprio código de acesso (Equipe) antes de desligar o e-mail e a senha.");
  }
  await setSetting("login_modo", modo);
  await audit(actor, "acesso.modo_login", { detalhes: { modo } });
}
