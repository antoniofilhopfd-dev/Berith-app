// Incorpora db/migrations/*.sql em um módulo TypeScript (não precisa de banco).
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const raiz = join(dirname(fileURLToPath(import.meta.url)), "..");
const pasta = join(raiz, "db", "migrations");
const arquivos = readdirSync(pasta).filter((f) => f.endsWith(".sql")).sort();
const padrao = /^(\d{3})_[a-z0-9_]+\.sql$/;
const vistos = new Set();
const lista = arquivos.map((f, i) => {
  const m = padrao.exec(f);
  if (!m) throw new Error(`Nome de migração inválido: ${f} (use NNN_nome.sql)`);
  if (vistos.has(m[1])) throw new Error(`Número de migração duplicado: ${m[1]}`);
  vistos.add(m[1]);
  if (Number(m[1]) !== i + 1) throw new Error(`Sequência quebrada em ${f}: esperado ${String(i + 1).padStart(3, "0")}`);
  const sql = readFileSync(join(pasta, f), "utf8").replace(/\r\n/g, "\n");
  return { id: f.replace(/\.sql$/, ""), checksum: createHash("sha256").update(sql).digest("hex"), sql };
});
const saida =
  "// ARQUIVO GERADO por scripts/gerar-migracoes.mjs — não edite.\n" +
  'import type { Migration } from "./migrator";\n' +
  `export const MIGRATIONS: Migration[] = ${JSON.stringify(lista, null, 2)};\n`;
writeFileSync(join(raiz, "lib", "db", "migrations.generated.ts"), saida);
console.log(`[migrações] ${lista.length} incorporada(s).`);
