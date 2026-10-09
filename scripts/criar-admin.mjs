// Uso: ADMIN_SENHA='...' node --env-file=.env.local scripts/criar-admin.mjs email@exemplo.com "Nome Completo"
// Exige banco já migrado (inicie o app uma vez). A senha nunca vai para o repositório.
import mysql from "mysql2/promise";
import bcrypt from "bcryptjs";

const [email, nome] = process.argv.slice(2);
const senha = process.env.ADMIN_SENHA;
if (!email || !nome || !senha || senha.length < 10) {
  console.error('Uso: ADMIN_SENHA=<mín. 10 caracteres> node --env-file=.env.local scripts/criar-admin.mjs <email> "<nome>"');
  process.exit(1);
}
const conn = await mysql.createConnection({
  host: process.env.DB_HOST, port: Number(process.env.DB_PORT ?? 3306),
  database: process.env.DB_NAME, user: process.env.DB_USER, password: process.env.DB_PASSWORD,
});
try {
  const hash = await bcrypt.hash(senha, 12);
  const [r] = await conn.execute(
    "INSERT INTO users (nome, email, senha_hash, status) VALUES (?, ?, ?, 'ativo')", [nome, email.toLowerCase(), hash]);
  const [[role]] = await conn.execute("SELECT id FROM roles WHERE codigo = 'admin_geral'");
  await conn.execute("INSERT INTO user_roles (user_id, role_id, scope_unit_id, scope_unit_id_key) VALUES (?, ?, NULL, 0)", [r.insertId, role.id]);
  console.log(`Administrador criado (id ${r.insertId}).`);
} catch (e) {
  console.error("Falha:", e.code ?? e.message);
  process.exitCode = 1;
} finally {
  await conn.end();
}
