import mysql from "mysql2/promise";
import { dbConfig, closePool, ensureReady, execute } from "@/lib/db";

export async function resetTestDb() {
  const cfg = dbConfig();
  if (!cfg.database.endsWith("_test")) throw new Error("Recusado: só zera bancos terminados em _test");
  await closePool();
  const c = await mysql.createConnection({ ...cfg });
  await c.query("SET FOREIGN_KEY_CHECKS = 0");
  const [rows] = await c.query<mysql.RowDataPacket[]>("SELECT table_name AS t FROM information_schema.tables WHERE table_schema = ?", [cfg.database]);
  for (const r of rows) await c.query(`DROP TABLE IF EXISTS \`${r.t}\``);
  await c.query("SET FOREIGN_KEY_CHECKS = 1");
  await c.end();
  await ensureReady();
}

export async function criarUsuario(email: string, nome = "Teste") {
  const r = await execute("INSERT INTO users (nome, email, senha_hash, status) VALUES (?, ?, 'x', 'ativo')", [nome, email]);
  return r.insertId;
}
export async function criarUnidade(tipo: string, nome: string, parent: number | null = null) {
  const r = await execute("INSERT INTO org_units (tipo, nome, parent_id) VALUES (?, ?, ?)", [tipo, nome, parent]);
  return r.insertId;
}
export async function darPapel(userId: number, codigo: string, unitId: number | null = null) {
  await execute(
    "INSERT INTO user_roles (user_id, role_id, scope_unit_id, scope_unit_id_key) SELECT ?, id, ?, ? FROM roles WHERE codigo = ?",
    [userId, unitId, unitId ?? 0, codigo],
  );
}
export async function vincular(userId: number, unitId: number) {
  await execute("INSERT INTO memberships (user_id, unit_id, inicio) VALUES (?, ?, '2020-01-01')", [userId, unitId]);
}
