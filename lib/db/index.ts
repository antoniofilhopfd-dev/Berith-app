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
      dateStrings: ["DATE"], // colunas DATE (sem hora) chegam como "AAAA-MM-DD", sem deslocamento de fuso
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

/**
 * Exclusão mútua entre processos/execuções via GET_LOCK. A trava pertence à SESSÃO do banco, por isso é obtida e
 * liberada numa conexão dedicada, mantida durante `fn` (num pool, outra conexão poderia reutilizá-la ou nunca liberá-la).
 * Retorna `{ ocupado: true }` se outra execução já está rodando.
 */
export async function comTrava<T>(nome: string, fn: () => Promise<T>): Promise<{ ocupado: true } | { ocupado: false; valor: T }> {
  await ensureReady();
  const conn = await getPool().getConnection();
  try {
    const [r] = await conn.query<RowDataPacket[]>("SELECT GET_LOCK(?, 0) AS ok", [nome]);
    if (r[0].ok !== 1) return { ocupado: true };
    try { return { ocupado: false, valor: await fn() }; }
    finally { await conn.query("SELECT RELEASE_LOCK(?)", [nome]).catch(() => undefined); }
  } finally {
    conn.release();
  }
}

export async function closePool() {
  if (g.__nbPool) await g.__nbPool.end();
  g.__nbPool = undefined;
  g.__nbReady = undefined;
}
