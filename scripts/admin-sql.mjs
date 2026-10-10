// Gera o SQL para criar o PRIMEIRO administrador quando não há acesso ao terminal da hospedagem (use no phpMyAdmin).
// A senha é lida do ambiente (nunca como argumento) e só o HASH aparece no SQL. Uso:
//   ADMIN_SENHA='uma senha longa' npm run admin:sql -- email@exemplo.com "Nome Completo"
import bcrypt from "bcryptjs";

const [email, nome] = process.argv.slice(2);
const senha = process.env.ADMIN_SENHA;
if (!email || !nome || !senha || senha.length < 10 || !/[a-zA-Z]/.test(senha) || !/\d/.test(senha)) {
  console.error('Uso: ADMIN_SENHA=<mín. 10 caracteres, com letras e números> npm run admin:sql -- <email> "<nome>"');
  process.exit(1);
}
const esc = (s) => "'" + String(s).replace(/\\/g, "\\\\").replace(/'/g, "''") + "'";
const hash = await bcrypt.hash(senha, 12);
console.log(`-- Execute UMA vez, depois que o app tiver iniciado e aplicado as migrações.
INSERT INTO users (nome, email, senha_hash, status) VALUES (${esc(nome)}, ${esc(email.toLowerCase())}, ${esc(hash)}, 'ativo');
INSERT INTO user_roles (user_id, role_id, scope_unit_id, scope_unit_id_key)
  SELECT LAST_INSERT_ID(), id, NULL, 0 FROM roles WHERE codigo = 'admin_geral';`);
