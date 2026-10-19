import mysql from "mysql2/promise";
import { dbConfig } from "@/lib/db";
import { assertCan } from "@/lib/permissions";
import { audit } from "./audit";
import { DomainError } from "./errors";
import { query } from "@/lib/db";
import type { RowDataPacket } from "mysql2/promise";

/** Direitos do titular (LGPD) pela tela de Equipe: exportar os dados da pessoa e anonimizá-la (mesma lógica de `npm run lgpd`). */
async function comConexao<T>(fn: (conn: mysql.Connection, lgpd: { exportarDados: (c: mysql.Connection, email: string) => Promise<unknown>; anonimizar: (c: mysql.Connection, email: string) => Promise<{ ok: boolean; motivo?: string }> }) => Promise<T>): Promise<T> {
  // @ts-expect-error módulo .mjs de operação (sem tipos)
  const lgpd = await import("../../scripts/lgpd.mjs");
  const conn = await mysql.createConnection(dbConfig());
  try { return await fn(conn, lgpd); } finally { await conn.end(); }
}
async function emailDe(userId: number): Promise<string> {
  const u = (await query<RowDataPacket>("SELECT email FROM users WHERE id = ?", [userId]))[0];
  if (!u) throw new DomainError("Pessoa não encontrada.");
  return String(u.email);
}

export async function exportarDadosDaPessoa(actor: number, userId: number) {
  await assertCan(actor, "equipe", "gerir");
  const email = await emailDe(userId);
  const dados = await comConexao((c, l) => l.exportarDados(c, email));
  await audit(actor, "lgpd.exportar", { entidade: "user", entidadeId: String(userId) });
  return dados;
}

export async function anonimizarPessoa(actor: number, userId: number) {
  await assertCan(actor, "equipe", "gerir");
  if (actor === userId) throw new DomainError("Você não pode anonimizar a própria conta.");
  const email = await emailDe(userId);
  const r = await comConexao((c, l) => l.anonimizar(c, email));
  if (!r.ok) throw new DomainError(r.motivo ?? "Não foi possível anonimizar.");
  await audit(actor, "lgpd.anonimizar_pela_tela", { entidade: "user", entidadeId: String(userId) });
}
