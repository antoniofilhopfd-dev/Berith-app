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

const helio = await user("Hélio Prado", "helio@exemplo.com");
await role(helio, "resp_servico", acolhida);
await memb(helio, acolhida, "Responsável"); await memb(carla, acolhida, "Acolhedora");
await c.execute("INSERT IGNORE INTO member_profiles (user_id) VALUES (?)", [helio]);
const mariana = await user("Mariana Souto", "mariana@exemplo.com");
await role(mariana, "resp_comunicacao");
await c.execute("INSERT IGNORE INTO member_profiles (user_id) VALUES (?)", [mariana]);
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
// ---- Eventos e comunicados (datas relativas a hoje; fuso fixo -03:00 só para a demonstração)
const dia = (n, hh, mm = 0) => { const d = new Date(Date.now() + n * 86400_000); d.setUTCHours(hh + 3, mm, 0, 0); return d; };
const ate = (n) => new Date(Date.now() + n * 86400_000).toISOString().slice(0, 10);
const evento = async (unitId, titulo, inicio, fim, extra = {}) => (await c.execute(
  `INSERT INTO events (unit_id, titulo, descricao, local, inicio, fim, responsavel_id, limite_participantes, recorrencia, recorrencia_ate, criado_por)
   VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
  [unitId, titulo, extra.desc ?? null, extra.local ?? null, inicio, fim, extra.resp ?? 1, extra.limite ?? null, extra.rec ?? "nenhuma", extra.ate ?? null, 1]))[0].insertId;
await evento(null, "Missa da Comunidade", dia(1, 19), dia(1, 20, 30), { local: "Capela Nova Berith", desc: "Celebração semanal aberta a todos os membros.", rec: "semanal", ate: ate(120) });
const retiro = await evento(null, "Retiro de Advento", dia(12, 8), dia(12, 17), { local: "Casa de Retiros São José", limite: 30, desc: "Um dia de oração e partilha. Inscrição por confirmação no app." });
await evento(mus, "Ensaio do Ministério de Música", dia(2, 20), dia(2, 21, 30), { local: "Salão paroquial", resp: ana, rec: "semanal", ate: ate(90) });
await evento(lit, "Reunião de Liturgia", dia(4, 19, 30), dia(4, 21), { local: "Sala 2", resp: bruno });
await evento(coral, "Ensaio extra do Coral", dia(5, 18), dia(5, 19, 30), { local: "Capela", resp: ana, limite: 12 });
for (const u of [1, ana, carla, bruno, davi]) await c.execute("INSERT IGNORE INTO event_rsvps (event_id, occurrence_date, user_id, status) VALUES (?,?,?, 'confirmado')", [retiro, ate(12), u]);
const com1 = (await c.execute("INSERT INTO announcements (unit_id, titulo, corpo, prioridade, publicar_em, criado_por) VALUES (NULL,?,?,?,UTC_TIMESTAMP(),1)",
  ["Inscrições abertas para o Retiro de Advento", "Estão abertas as inscrições para o Retiro de Advento. Confirme sua presença na agenda do aplicativo; as vagas são limitadas.", "importante"]))[0].insertId;
await c.execute("INSERT INTO announcements (unit_id, titulo, corpo, prioridade, publicar_em, criado_por) VALUES (?,?,?,?,UTC_TIMESTAMP(),?)",
  [mus, "Repertório da próxima celebração", "Pessoal da Música: o repertório está definido. Ensaio na quarta, 20h, no salão paroquial.", "normal", ana]);
await c.execute("INSERT INTO announcements (unit_id, titulo, corpo, prioridade, publicar_em, expira_em, criado_por) VALUES (NULL,?,?,?,UTC_TIMESTAMP(),DATE_ADD(UTC_TIMESTAMP(), INTERVAL 2 DAY),1)",
  ["Mudança de local da missa", "Por causa de obras, a missa desta semana será no salão paroquial.", "urgente"]);
await c.execute("INSERT INTO announcement_reads (announcement_id, user_id) VALUES (?,?)", [com1, ana]);
// ---- Escalas, tarefas, reuniões, presença
const agoraMais = (n, h, m = 0) => dia(n, h, m);
const shift = async (unitId, titulo, ini, fim) => (await c.execute("INSERT INTO shifts (unit_id, titulo, inicio, fim, criado_por) VALUES (?,?,?,?,?)", [unitId, titulo, ini, fim, helio]))[0].insertId;
const s1 = await shift(acolhida, "Missa de domingo — 1ª celebração", agoraMais(3, 8), agoraMais(3, 10));
await c.execute("INSERT INTO shift_assignments (shift_id, user_id, funcao, status) VALUES (?,?,?,?)", [s1, davi, "Porta principal", "confirmado"]);
await c.execute("INSERT INTO shift_assignments (shift_id, user_id, funcao, status) VALUES (?,?,?,?)", [s1, carla, "Entrega de folhetos", "pendente"]);
const s2 = await shift(acolhida, "Missa de domingo — 2ª celebração", agoraMais(3, 18), agoraMais(3, 20));
await c.execute("INSERT INTO shift_assignments (shift_id, user_id, funcao, status) VALUES (?,?,?,?)", [s2, davi, "Porta principal", "pendente"]);
await evento(mus, "Ensaio geral (hoje)", new Date(Date.now() - 30 * 60_000), new Date(Date.now() + 90 * 60_000), { local: "Salão paroquial", resp: ana });
const tk = async (unitId, titulo, resp, prazoDias, prio, status = "aberta") => (await c.execute(
  "INSERT INTO tasks (unit_id, titulo, descricao, prazo, prioridade, status, responsavel_id, criado_por) VALUES (?,?,?,?,?,?,?,?)",
  [unitId, titulo, null, ate(prazoDias), prio, status, resp, ana]))[0].insertId;
await tk(mus, "Preparar as partituras do Advento", carla, 3, "alta");
await tk(mus, "Reservar o salão para o ensaio extra", ana, -2, "media", "em_andamento");
await tk(mus, "Revisar o repertório da vigília", carla, 10, "baixa", "concluida");
const reu = (await c.execute("INSERT INTO meetings (unit_id, titulo, inicio, fim, local, pauta, criado_por) VALUES (?,?,?,?,?,?,?)",
  [mus, "Reunião do Ministério de Música", agoraMais(4, 20), agoraMais(4, 21, 30), "Sala 2", "1. Oração inicial\n2. Repertório do Advento\n3. Escala dos ensaios\n4. Assuntos gerais", ana]))[0].insertId;
for (const u of [ana, carla]) await c.execute("INSERT INTO meeting_participants (meeting_id, user_id) VALUES (?,?)", [reu, u]);
// ---- Liturgia: SOMENTE exemplos fictícios para demonstrar o layout (não é conteúdo litúrgico real)
const hojeISO = new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);
const fonteDemo = "Demonstração do sistema (conteúdo fictício)";
for (const [tipo, titulo, texto] of [
  ["evangelho", "Exemplo de cadastro — referência do Evangelho", "Este é um texto de demonstração para mostrar o layout da página. O conteúdo real deve ser cadastrado por pessoa autorizada, com a fonte e a autorização de uso."],
  ["santo", "Exemplo de cadastro — santo do dia", "Texto de demonstração. Informe a biografia resumida e a fonte consultada."],
  ["laudes", "Exemplo de cadastro — Laudes", null],
]) await c.execute("INSERT INTO liturgia_itens (data, tipo, titulo, texto, fonte_nome, direitos, criado_por) VALUES (?,?,?,?,?,?,?)", [hojeISO, tipo, titulo, texto, fonteDemo, "Sem conteúdo protegido", mariana]);
console.log("Seed concluído. Senha de todos: Demo-Senha-12345");
await c.end();
