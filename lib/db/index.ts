import mysql, { type Pool, type PoolConnection, type RowDataPacket, type ResultSetHeader } from "mysql2/promise";
import { MIGRATIONS } from "./migrations.generated";
import { runMigrations, type ConnConfig } from "./migrator";

type Globals = { __nbPool?: Pool; __nbReady?: Promise<void> };
const g = globalThis as unknown as Globals;

export function dbConfig(): ConnConfig {
  const faltando = ["DB_HOST", "DB_NAME", "DB_USER", "DB_PASSWORD"].filter((k) => !process.env[k]);
  if (faltando.length) throw new Error(`Variáveis de ambiente ausentes: ${faltando.join(", ")}`);
  return {
    host: process.env.DB_HOST!,
    port: Number(process.env.DB_PORT ?? 3306),
    database: process.env.DB_NAME!,
    user: process.env.DB_USER!,
    password: process.env.DB_PASSWORD!,
  };
}

function getPool(): Pool {
  if (!g.__nbPool) {
    g.__nbPool = mysql.createPool({
      ...dbConfig(),
      charset: "utf8mb4",
      timezone: "Z", // datas armazenadas em UTC
      waitForConnections: true,
      connectionLimit: Number(process.env.DB_POOL_LIMIT ?? 5),
      queueLimit: 50,
      decimalNumbers: false,
      namedPlaceholders: false,
    });
  }
  return g.__nbPool;
}

/** Aplica as migrações pendentes uma única vez por processo, antes de qualquer operação de negócio. */
export function ensureReady(): Promise<void> {
  if (!g.__nbReady) {
    g.__nbReady = runMigrations(dbConfig(), MIGRATIONS).then(
      () => undefined,
      (e) => {
        g.__nbReady = undefined; // permite nova tentativa após correção
        console.error("[db] falha ao preparar o banco:", e instanceof Error ? e.message : "erro desconhecido");
        throw e;
      },
    );
  }
  return g.__nbReady;
}

export async function query<T extends RowDataPacket>(sql: string, params: unknown[] = []): Promise<T[]> {
  await ensureReady();
  const [rows] = await getPool().query<T[]>(sql, params);
  return rows;
}

export async function execute(sql: string, params: unknown[] = []): Promise<ResultSetHeader> {
  await ensureReady();
  const [res] = await getPool().query<ResultSetHeader>(sql, params);
  return res;
}

export async function tx<T>(fn: (conn: PoolConnection) => Promise<T>): Promise<T> {
  await ensureReady();
  const conn = await getPool().getConnection();
  try {
    await conn.beginTransaction();
    const out = await fn(conn);
    await conn.commit();
    return out;
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

export async function closePool() {
  if (g.__nbPool) await g.__nbPool.end();
  g.__nbPool = undefined;
  g.__nbReady = undefined;
}
