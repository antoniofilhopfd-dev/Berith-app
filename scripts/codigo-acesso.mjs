#!/usr/bin/env node
// Gera um código de acesso para uma pessoa pelo e-mail (para recuperar o acesso do administrador).
// Uso: node scripts/codigo-acesso.mjs pessoa@exemplo.org     (lê DB_* e SESSION_SECRET do ambiente / .env.local)
import { createHmac, randomInt } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import mysql from "mysql2/promise";

for (const f of [".env.local", ".env"]) {
  if (existsSync(f)) for (const l of readFileSync(f, "utf8").split(/\r?\n/)) { const m = /^([A-Z0-9_]+)=(.*)$/.exec(l.trim()); if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, ""); }
}
const email = (process.argv[2] ?? "").trim().toLowerCase();
if (!email) { console.error("Informe o e-mail da pessoa: node scripts/codigo-acesso.mjs pessoa@exemplo.org"); process.exit(1); }
const segredo = process.env.SESSION_SECRET ?? "";
if (segredo.length < 32) { console.error("SESSION_SECRET ausente ou curto demais."); process.exit(1); }

const LETRAS = "ABCDEFGHJKLMNPQRSTUVWXYZ"; // sem I e O
const SEQ = new Set(["0000", "1111", "2222", "3333", "4444", "5555", "6666", "7777", "8888", "9999", "1234", "4321", "0123", "3210", "2345", "5432", "6789", "9876"]);
let n; do { n = String(randomInt(0, 10000)).padStart(4, "0"); } while (SEQ.has(n));
const codigo = LETRAS[randomInt(LETRAS.length)] + LETRAS[randomInt(LETRAS.length)] + n;
const hmac = createHmac("sha256", segredo).update("acesso-v1:" + codigo).digest("hex");

const c = await mysql.createConnection({ host: process.env.DB_HOST ?? "127.0.0.1", port: Number(process.env.DB_PORT ?? 3306), user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_NAME });
try {
  const [r] = await c.query("UPDATE users SET acesso_hmac = ?, acesso_gerado_em = UTC_TIMESTAMP() WHERE email = ? AND status = 'ativo'", [hmac, email]);
  if (!r.affectedRows) { console.error("Nenhuma pessoa ativa com esse e-mail."); process.exit(1); }
  await c.query("UPDATE sessions SET revogada_em = UTC_TIMESTAMP() WHERE user_id = (SELECT id FROM users WHERE email = ?) AND revogada_em IS NULL", [email]);
  console.log(`Código de acesso de ${email}: ${codigo}  (anote agora: não fica guardado e não pode ser consultado depois)`);
} finally { await c.end(); }
