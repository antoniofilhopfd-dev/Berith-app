import { describe, it, expect, beforeEach, afterAll } from "vitest";
import mysql from "mysql2/promise";
import { dbConfig } from "@/lib/db";
import { runMigrations, MigrationError, type Migration } from "@/lib/db/migrator";
import { MIGRATIONS } from "@/lib/db/migrations.generated";
import { createHash } from "node:crypto";

const mk = (id: string, sql: string): Migration => ({ id, sql, checksum: createHash("sha256").update(sql).digest("hex") });
const silent = () => {};

async function zerar() {
  const cfg = dbConfig();
  expect(cfg.database.endsWith("_test")).toBe(true);
  const c = await mysql.createConnection(cfg);
  await c.query("SET FOREIGN_KEY_CHECKS=0");
  const [rows] = await c.query<mysql.RowDataPacket[]>("SELECT table_name t FROM information_schema.tables WHERE table_schema=?", [cfg.database]);
  for (const r of rows) await c.query(`DROP TABLE IF EXISTS \`${r.t}\``);
  await c.end();
}

describe("migrações", () => {
  beforeEach(zerar);
  afterAll(zerar);

  it("aplica todas em banco vazio e é idempotente", async () => {
    const a = await runMigrations(dbConfig(), MIGRATIONS, silent);
    expect(a).toEqual(MIGRATIONS.map((m) => m.id));
    expect(await runMigrations(dbConfig(), MIGRATIONS, silent)).toEqual([]);
  });

  it("registra id, checksum e resultado", async () => {
    await runMigrations(dbConfig(), MIGRATIONS, silent);
    const c = await mysql.createConnection(dbConfig());
    const [rows] = await c.query<mysql.RowDataPacket[]>("SELECT id, resultado, checksum, aplicada_em FROM schema_migrations ORDER BY id");
    await c.end();
    expect(rows.map((r) => r.id)).toEqual(MIGRATIONS.map((m) => m.id));
    expect(rows.every((r) => r.resultado === "ok" && r.aplicada_em)).toBe(true);
  });

  it("recusa migração já aplicada cujo conteúdo foi editado", async () => {
    await runMigrations(dbConfig(), [mk("001_a", "CREATE TABLE IF NOT EXISTS t1 (id INT)")], silent);
    await expect(
      runMigrations(dbConfig(), [mk("001_a", "CREATE TABLE IF NOT EXISTS t1 (id INT, x INT)")], silent),
    ).rejects.toThrow(MigrationError);
  });

  it("falha explícita, registra 'falhou' e se recupera após correção", async () => {
    const ruim = mk("002_b", "CREATE TABLE IF NOT EXISTS t2 (id INT); INSERT INTO tabela_inexistente VALUES (1)");
    const boa = mk("001_a", "CREATE TABLE IF NOT EXISTS t1 (id INT)");
    await expect(runMigrations(dbConfig(), [boa, ruim], silent)).rejects.toThrow(/002_b/);
    const c = await mysql.createConnection(dbConfig());
    const [rows] = await c.query<mysql.RowDataPacket[]>("SELECT id, resultado, erro FROM schema_migrations ORDER BY id");
    expect(rows.map((r) => [r.id, r.resultado])).toEqual([["001_a", "ok"], ["002_b", "falhou"]]);
    expect(rows[1].erro).toBeTruthy();
    await c.end();
    // Correção: nova versão da migração que ainda não estava 'ok' pode ser reaplicada.
    const corrigida = mk("002_b", "CREATE TABLE IF NOT EXISTS t2 (id INT)");
    expect(await runMigrations(dbConfig(), [boa, corrigida], silent)).toEqual(["002_b"]);
  });

  it("não vaza a senha do banco nas mensagens de erro", async () => {
    const ruim = mk("001_x", "SELECT * FROM nada");
    const err = await runMigrations(dbConfig(), [ruim], silent).then(() => new Error(""), (e: Error) => e);
    expect(err.message).not.toContain(dbConfig().password);
  });

  it("rejeita ids duplicados ou fora de ordem", async () => {
    await expect(runMigrations(dbConfig(), [mk("002_a", "SELECT 1"), mk("001_b", "SELECT 1")], silent)).rejects.toThrow(/fora de ordem/);
    await expect(runMigrations(dbConfig(), [mk("001_a", "SELECT 1"), mk("001_a", "SELECT 1")], silent)).rejects.toThrow(/duplicado/);
  });

  it("duas instâncias simultâneas não aplicam a mesma migração duas vezes", async () => {
    const m = [mk("001_a", "CREATE TABLE IF NOT EXISTS t1 (id INT); SELECT SLEEP(1)")];
    const [a, b] = await Promise.all([runMigrations(dbConfig(), m, silent), runMigrations(dbConfig(), m, silent)]);
    expect(a.length + b.length).toBe(1);
  });
});
