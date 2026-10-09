// SOMENTE DESENVOLVIMENTO: dados fictícios para testes visuais. Recusa rodar em produção.
import mysql from "mysql2/promise";
import bcrypt from "bcryptjs";
import { createHash } from "node:crypto";

if (process.env.NODE_ENV === "production" || process.env.PERMITIR_SEED !== "sim") {
  console.error("Recusado. Use apenas em desenvolvimento com PERMITIR_SEED=sim.");
  process.exit(1);
}
const c = await mysql.createConnection({
  host: process.env.DB_HOST, port: Number(process.env.DB_PORT ?? 3306),
  database: process.env.DB_NAME, user: process.env.DB_USER, password: process.env.DB_PASSWORD,
});
const hash = await bcrypt.hash("Demo-Senha-12345", 12);
const unit = async (tipo, nome, parent = null, desc = null) =>
  (await c.execute("INSERT INTO org_units (tipo, nome, descricao, parent_id) VALUES (?,?,?,?)", [tipo, nome, desc, parent]))[0].insertId;
const user = async (nome, email, status = "ativo") =>
  (await c.execute("INSERT INTO users (nome, email, senha_hash, status) VALUES (?,?,?,?)", [nome, email, hash, status]))[0].insertId;
const role = async (u, codigo, scope = null) =>
  c.execute("INSERT INTO user_roles (user_id, role_id, scope_unit_id, scope_unit_id_key) SELECT ?, id, ?, ? FROM roles WHERE codigo=?", [u, scope, scope ?? 0, codigo]);
const memb = (u, un, f = null) => c.execute("INSERT INTO memberships (user_id, unit_id, funcao, inicio) VALUES (?,?,?, '2024-03-01')", [u, un, f]);

const com = await unit("comunidade", "Comunidade Nova Berith");
const cam1 = await unit("caminho", "Caminho de Iniciação", com, "Primeiros passos na vida comunitária.");
const cam2 = await unit("caminho", "Caminho de Aprofundamento", com);
const mus = await unit("ministerio", "Ministério de Música", cam1);
const lit = await unit("ministerio", "Ministério de Liturgia", cam2);
const coral = await unit("grupo", "Coral", mus);
const acolhida = await unit("servico", "Acolhida", lit, "Recepção nas celebrações.");

const ana = await user("Ana Beatriz Souza", "ana@exemplo.com");
const bruno = await user("Bruno Carvalho", "bruno@exemplo.com");
const carla = await user("Carla Menezes", "carla@exemplo.com");
const davi = await user("Davi Ribeiro", "davi@exemplo.com");
const fin = await user("Elisa Tesoureira", "elisa@exemplo.com");
await role(ana, "coord_ministerio", mus);
await role(bruno, "coord_ministerio", lit);
await role(fin, "resp_financeiro");
await memb(ana, mus, "Coordenadora"); await memb(carla, mus, "Cantora"); await memb(carla, coral);
await memb(bruno, lit, "Coordenador"); await memb(davi, acolhida, "Acolhedor");
for (const u of [ana, bruno, carla, davi, fin]) await c.execute("INSERT IGNORE INTO member_profiles (user_id, telefone) VALUES (?, ?)", [u, "(11) 90000-000" + (u % 10)]);

// Pendente aguardando aprovação para Música
const pend = await user("Felipe Andrade", "felipe@exemplo.com", "pendente");
const inv = (await c.execute("INSERT INTO invitations (email, nome, token_hash, convidado_por, expira_em, aceito_em) VALUES (?,?,?,?, DATE_ADD(UTC_TIMESTAMP(), INTERVAL 5 DAY), UTC_TIMESTAMP())",
  ["felipe@exemplo.com", "Felipe Andrade", createHash("sha256").update("demo-aceito").digest("hex"), ana]))[0].insertId;
await c.execute("INSERT INTO invitation_units (invitation_id, unit_id, funcao) VALUES (?,?,?)", [inv, mus, "Violonista"]);
await c.execute("INSERT INTO user_invitation (user_id, invitation_id) VALUES (?,?)", [pend, inv]);
// Convite aberto (token conhecido só em dev)
const inv2 = (await c.execute("INSERT INTO invitations (email, nome, token_hash, convidado_por, expira_em) VALUES (?,?,?,?, DATE_ADD(UTC_TIMESTAMP(), INTERVAL 5 DAY))",
  ["gabriela@exemplo.com", "Gabriela Lima", createHash("sha256").update("demo-convite-aberto").digest("hex"), ana]))[0].insertId;
await c.execute("INSERT INTO invitation_units (invitation_id, unit_id, funcao) VALUES (?,?,NULL)", [inv2, mus]);
console.log("Seed concluído. Senha de todos: Demo-Senha-12345");
await c.end();
