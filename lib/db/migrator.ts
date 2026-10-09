import mysql from "mysql2/promise";

export type Migration = { id: string; checksum: string; sql: string };
export type ConnConfig = {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
};

export const MIGRATION_LOCK = "nova_berith_migrations";

export class MigrationError extends Error {
  constructor(
    public migrationId: string,
    message: string,
  ) {
    super(`Falha na migração ${migrationId}: ${message}`);
    this.name = "MigrationError";
  }
}

type AppliedRow = { id: string; checksum: string; resultado: "ok" | "falhou" } & mysql.RowDataPacket;

function validate(migrations: Migration[]) {
  const ids = new Set<string>();
  let anterior = "";
  for (const m of migrations) {
    if (ids.has(m.id)) throw new MigrationError(m.id, "identificador duplicado");
    if (m.id <= anterior) throw new MigrationError(m.id, "fora de ordem");
    ids.add(m.id);
    anterior = m.id;
  }
}

/**
 * Aplica somente as migrações pendentes, sob bloqueio (GET_LOCK) para impedir
 * execução simultânea por duas instâncias. Usa conexão própria com
 * multipleStatements. DDL do MySQL faz commit implícito: por isso as migrações
 * devem ser idempotentes; uma falha fica registrada como "falhou" e é
 * reexecutada na próxima inicialização depois de corrigida a causa.
 */
export async function runMigrations(
  config: ConnConfig,
  migrations: Migration[],
  log: (msg: string) => void = (m) => console.log(m),
): Promise<string[]> {
  validate(migrations);
  const conn = await mysql.createConnection({ ...config, multipleStatements: true, charset: "utf8mb4" });
  const aplicadas: string[] = [];
  try {
    const [lockRows] = await conn.query<mysql.RowDataPacket[]>("SELECT GET_LOCK(?, 60) AS ok", [MIGRATION_LOCK]);
    if (lockRows[0]?.ok !== 1) throw new Error("Não foi possível obter o bloqueio de migração (outra instância em execução?).");
    try {
      await conn.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
        id VARCHAR(100) NOT NULL PRIMARY KEY,
        checksum CHAR(64) NOT NULL,
        resultado ENUM('ok','falhou') NOT NULL,
        erro TEXT NULL,
        aplicada_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
      const [rows] = await conn.query<AppliedRow[]>("SELECT id, checksum, resultado FROM schema_migrations");
      const registro = new Map(rows.map((r) => [r.id, r]));

      for (const m of migrations) {
        const r = registro.get(m.id);
        if (r?.resultado === "ok") {
          if (r.checksum !== m.checksum) {
            throw new MigrationError(m.id, "o conteúdo difere do que foi aplicado (migração aplicada nunca deve ser editada; crie uma nova)");
          }
          continue;
        }
        log(`[migrações] aplicando ${m.id}`);
        try {
          await conn.query(m.sql);
        } catch (e) {
          const msg = (e instanceof Error ? e.message : String(e)).slice(0, 500);
          await conn.query(
            `INSERT INTO schema_migrations (id, checksum, resultado, erro) VALUES (?, ?, 'falhou', ?)
             ON DUPLICATE KEY UPDATE checksum = VALUES(checksum), resultado = 'falhou', erro = VALUES(erro), aplicada_em = CURRENT_TIMESTAMP`,
            [m.id, m.checksum, msg],
          );
          throw new MigrationError(m.id, msg);
        }
        await conn.query(
          `INSERT INTO schema_migrations (id, checksum, resultado, erro) VALUES (?, ?, 'ok', NULL)
           ON DUPLICATE KEY UPDATE checksum = VALUES(checksum), resultado = 'ok', erro = NULL, aplicada_em = CURRENT_TIMESTAMP`,
          [m.id, m.checksum],
        );
        aplicadas.push(m.id);
      }

      await verifyIntegrity(conn, migrations);
    } finally {
      await conn.query("SELECT RELEASE_LOCK(?)", [MIGRATION_LOCK]);
    }
  } finally {
    await conn.end();
  }
  return aplicadas;
}

/** Todas as migrações conhecidas devem constar como "ok" com o mesmo checksum. */
export async function verifyIntegrity(conn: mysql.Connection, migrations: Migration[]) {
  const [rows] = await conn.query<AppliedRow[]>("SELECT id, checksum, resultado FROM schema_migrations");
  const registro = new Map(rows.map((r) => [r.id, r]));
  for (const m of migrations) {
    const r = registro.get(m.id);
    if (!r || r.resultado !== "ok") throw new MigrationError(m.id, "não consta como aplicada com sucesso");
    if (r.checksum !== m.checksum) throw new MigrationError(m.id, "checksum divergente");
  }
}
