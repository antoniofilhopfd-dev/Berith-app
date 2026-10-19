import { createHash, createHmac, randomBytes, randomInt } from "node:crypto";
import type { RowDataPacket } from "mysql2/promise";
import { execute, query } from "@/lib/db";
import { assertCan } from "@/lib/permissions";
import { audit } from "@/lib/services/audit";
import { DomainError, NotFoundError } from "@/lib/services/errors";
import { getSetting, setSetting } from "@/lib/services/configuracoes";
import { cifraDisponivel, cifrar, decifrar } from "@/lib/integracoes/cripto";

/**
 * Código de acesso: 2 letras + 4 números (ex.: AB1234), como no EVO MKT. Letras sem I/O, números sem sequências óbvias (0000, 1234…).
 * São ~5,7 milhões de combinações, então a proteção está nas tentativas: limite por endereço, limite global (que só barra
 * aparelhos desconhecidos), atraso crescente e auditoria. No banco fica só o HMAC-SHA256 (chave = SESSION_SECRET):
 * o código não pode ser recuperado, apenas substituído por outro. Trocar o SESSION_SECRET invalida todos os códigos.
 * Códigos antigos de 8 caracteres (XXXX-XXXX) continuam valendo até serem substituídos.
 */
const LETRAS = "ABCDEFGHJKLMNPQRSTUVWXYZ";
export const MAX_FALHAS_IP_CODIGO = 8;
export const MAX_FALHAS_GLOBAL_CODIGO = 100;
export const JANELA_MIN = 15;
const MARCA = "(código)"; // vai na coluna e-mail de login_attempts
const SEQUENCIAS = new Set(["0000", "1111", "2222", "3333", "4444", "5555", "6666", "7777", "8888", "9999", "1234", "4321", "0123", "3210", "2345", "5432", "6789", "9876"]);

export type ModoLogin = "codigo" | "ambos";
export async function modoLogin(): Promise<ModoLogin> { return (await getSetting("login_modo", "ambos")) === "codigo" ? "codigo" : "ambos"; }

/** O código aparece como foi gerado: AB1234 (os antigos de 8 caracteres aparecem como XXXX-XXXX). */
export const formatarCodigo = (c: string) => (c.length === 8 ? `${c.slice(0, 4)}-${c.slice(4)}` : c);
/** Aceita minúsculas, espaços e hífen; devolve o código normalizado ou null se não tiver o formato. */
export function normalizarCodigo(entrada: string): string | null {
  const c = entrada.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return /^[A-Z0-9]{6,10}$/.test(c) ? c : null; // gerado (AB1234), antigo (8 caracteres) ou escolhido pelo administrador
}
export function gerarCodigo(): string {
  for (;;) {
    const n = String(randomInt(0, 10000)).padStart(4, "0");
    if (SEQUENCIAS.has(n)) continue;
    return LETRAS[randomInt(LETRAS.length)] + LETRAS[randomInt(LETRAS.length)] + n;
  }
}
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
      await execute("UPDATE users SET acesso_hmac = ?, acesso_enc = ?, acesso_gerado_em = UTC_TIMESTAMP() WHERE id = ?", [hmacCodigo(codigo), cifraDisponivel() ? cifrar(codigo) : null, userId]);
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

/** Valida um código escolhido pelo administrador: 6 a 10 letras/números, com ao menos uma letra e um número, sem padrões óbvios. */
export function validarCodigoEscolhido(entrada: string): string {
  const c = normalizarCodigo(entrada);
  if (!c) throw new DomainError("O código deve ter de 6 a 10 letras e números, sem espaços ou símbolos.");
  if (!/[A-Z]/.test(c) || !/\d/.test(c)) throw new DomainError("Use pelo menos uma letra e um número.");
  if (/^(.)\1+$/.test(c) || ["ABC123", "ABCD1234", "QWERTY1", "SENHA123", "CODIGO1"].includes(c) || /^(?:[A-Z]{2,}|\d{4,})$/.test(c)) throw new DomainError("Esse código é fácil demais de adivinhar. Escolha outro.");
  return c;
}

/** O administrador define um código específico para a pessoa (ex.: um que ela consiga memorizar). Encerra as sessões dela. */
export async function definirCodigo(actor: number, userId: number, entrada: string): Promise<{ codigo: string; nome: string }> {
  await assertCan(actor, "equipe", "gerir");
  const codigo = validarCodigoEscolhido(entrada);
  const u = (await query<RowDataPacket>("SELECT id, nome, status FROM users WHERE id = ?", [userId]))[0];
  if (!u) throw new NotFoundError();
  if (u.status !== "ativo") throw new DomainError("Só pessoas ativas recebem código de acesso.");
  try {
    await execute("UPDATE users SET acesso_hmac = ?, acesso_enc = ?, acesso_gerado_em = UTC_TIMESTAMP() WHERE id = ?", [hmacCodigo(codigo), cifraDisponivel() ? cifrar(codigo) : null, userId]);
  } catch (e) {
    if ((e as { code?: string }).code === "ER_DUP_ENTRY") throw new DomainError("Esse código já está em uso por outra pessoa. Escolha outro.");
    throw e;
  }
  await execute("UPDATE sessions SET revogada_em = UTC_TIMESTAMP() WHERE user_id = ? AND revogada_em IS NULL", [userId]);
  await audit(actor, "acesso.codigo_definido", { entidade: "user", entidadeId: String(userId) });
  return { codigo, nome: String(u.nome) };
}

/** Códigos de acesso (decifrados) de várias pessoas, só para quem gerencia a equipe. Pessoas sem código legível ficam de fora. */
export async function codigosVisiveis(actor: number): Promise<Map<number, string>> {
  await assertCan(actor, "equipe", "gerir");
  const out = new Map<number, string>();
  if (!cifraDisponivel()) return out;
  for (const r of await query<RowDataPacket>("SELECT id, acesso_enc FROM users WHERE acesso_enc IS NOT NULL AND acesso_hmac IS NOT NULL")) {
    try { out.set(Number(r.id), formatarCodigo(decifrar(String(r.acesso_enc)))); } catch { /* chave trocada: o código só pode ser substituído */ }
  }
  return out;
}

export async function revogarCodigo(actor: number, userId: number) {
  await assertCan(actor, "equipe", "gerir");
  await execute("UPDATE users SET acesso_hmac = NULL, acesso_enc = NULL, acesso_gerado_em = NULL WHERE id = ?", [userId]);
  await execute("UPDATE sessions SET revogada_em = UTC_TIMESTAMP() WHERE user_id = ? AND revogada_em IS NULL", [userId]);
  await audit(actor, "acesso.codigo_revogado", { entidade: "user", entidadeId: String(userId) });
}

const sha256 = (v: string) => createHash("sha256").update(v).digest("hex");
async function dispositivoConhecido(hash?: string): Promise<boolean> {
  return Boolean(hash && (await query<RowDataPacket>("SELECT 1 FROM dispositivos_conhecidos WHERE hash = ?", [hash])).length);
}
/** Registra/renova o aparelho que acabou de entrar. Devolve o valor do cookie (novo ou o mesmo). */
export async function registrarDispositivo(userId: number, cookieAtual?: string): Promise<string> {
  if (cookieAtual) {
    const r = await execute("UPDATE dispositivos_conhecidos SET visto_em = UTC_TIMESTAMP() WHERE hash = ? AND user_id = ?", [sha256(cookieAtual), userId]);
    if (r.affectedRows) return cookieAtual;
  }
  const novo = randomBytes(24).toString("base64url");
  await execute("INSERT INTO dispositivos_conhecidos (hash, user_id, criado_em, visto_em) VALUES (?, ?, UTC_TIMESTAMP(), UTC_TIMESTAMP())", [sha256(novo), userId]);
  return novo;
}
export const hashDispositivo = (cookie?: string) => (cookie ? sha256(cookie) : undefined);

async function bloqueado(ip: string): Promise<{ porIp: number; global: number }> {
  const r = await query<RowDataPacket>(
    `SELECT SUM(ip = ?) AS por_ip, COUNT(*) AS total FROM login_attempts WHERE sucesso = 0 AND email = ? AND criado_em > DATE_SUB(UTC_TIMESTAMP(), INTERVAL ${JANELA_MIN} MINUTE)`, [ip, MARCA]);
  return { porIp: Number(r[0]?.por_ip ?? 0), global: Number(r[0]?.total ?? 0) };
}

export type ResultadoCodigo = { ok: true; userId: number } | { ok: false; motivo: "bloqueado" | "codigo" };

/** Entrada por código, com limite de tentativas por endereço e global e atraso crescente. A resposta não revela o motivo da recusa. */
export async function autenticarCodigo(entrada: string, ip: string, espera = (ms: number) => new Promise<void>((r) => setTimeout(r, ms)), dispositivoHash?: string): Promise<ResultadoCodigo> {
  const f = await bloqueado(ip);
  // O limite global (ataque distribuído) só barra aparelhos desconhecidos: quem já entrou por aqui continua entrando.
  if (f.porIp >= MAX_FALHAS_IP_CODIGO || (f.global >= MAX_FALHAS_GLOBAL_CODIGO && !(await dispositivoConhecido(dispositivoHash)))) {
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
