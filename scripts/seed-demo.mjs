// SOMENTE DESENVOLVIMENTO: dados fictícios para testes visuais. Recusa rodar em produção.
// Uso: PERMITIR_SEED=sim SEED_MIDIAS_DIR=/caminho/com/imagens node --env-file=.env.local scripts/seed-demo.mjs
// (SEED_MIDIAS_DIR é opcional: pasta com manifesto.json + arquivos de imagem/vídeo de exemplo.)
import mysql from "mysql2/promise";
import bcrypt from "bcryptjs";
import { createHash, randomBytes } from "node:crypto";
import { copyFile, mkdir, readFile } from "node:fs/promises";
import path from "node:path";

if (process.env.NODE_ENV === "production" || process.env.PERMITIR_SEED !== "sim") {
  console.error("Recusado. Use apenas em desenvolvimento com PERMITIR_SEED=sim.");
  process.exit(1);
}
const c = await mysql.createConnection({ host: process.env.DB_HOST, port: Number(process.env.DB_PORT ?? 3306), database: process.env.DB_NAME, user: process.env.DB_USER, password: process.env.DB_PASSWORD, timezone: "Z" });
const hash = await bcrypt.hash("Demo-Senha-12345", 12);
const ins = async (sql, p = []) => (await c.query(sql, p))[0].insertId;

/** Instante UTC de "daqui a n dias, HH:MM" no fuso de São Paulo (UTC-3, sem horário de verão). */
const loc = (dias, hhmm = "12:00") => {
  const agora = new Date(Date.now() - 3 * 3600_000); const [h, m] = hhmm.split(":").map(Number);
  return new Date(Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth(), agora.getUTCDate() + dias, h + 3, m));
};

/* ----- Equipe ----- */
const pessoa = async (nome, email, perfil) => {
  const id = await ins("INSERT INTO users (nome, email, senha_hash, status) VALUES (?,?,?, 'ativo')", [nome, email, hash]);
  await c.query("INSERT INTO user_roles (user_id, role_id, scope_unit_id, scope_unit_id_key) SELECT ?, id, NULL, 0 FROM roles WHERE codigo = ?", [id, perfil]);
  await c.query("INSERT IGNORE INTO member_profiles (user_id, telefone) VALUES (?, ?)", [id, "(11) 98888-0000"]);
  return id;
};
const ana = await pessoa("Ana Coordenadora", "ana@exemplo.com", "coordenador");
const bruno = await pessoa("Bruno Souza", "bruno@exemplo.com", "integrante");
const carla = await pessoa("Carla Mendes", "carla@exemplo.com", "integrante");
const davi = await pessoa("Davi Aprovador", "davi@exemplo.com", "aprovador");
await ins("INSERT INTO users (nome, email, senha_hash, status) VALUES ('Sem Perfil', 'sem@exemplo.com', ?, 'ativo')", [hash]);
const [[adm]] = await c.query("SELECT u.id FROM users u JOIN user_roles ur ON ur.user_id = u.id JOIN roles r ON r.id = ur.role_id AND r.codigo = 'admin' LIMIT 1");
const admin = adm?.id ?? ana;

/* ----- Planejamento ----- */
const [[ed]] = await c.query("SELECT (SELECT id FROM editorias WHERE nome='Evangelização') ev, (SELECT id FROM editorias WHERE nome='Eventos') evt, (SELECT id FROM editorias WHERE nome='Institucional') ins, (SELECT id FROM editorias WHERE nome='Testemunhos') tes");
const advento = await ins("INSERT INTO campanhas (nome, objetivo, descricao, inicio, fim, cor, status, responsavel_id, criado_por) VALUES ('Advento 2026','Preparar a comunidade para o Natal','Série de conteúdos semanais, novena e retiro.', ?, ?, '#b07840','ativa',?,?)", [loc(-10).toISOString().slice(0, 10), loc(60).toISOString().slice(0, 10), ana, ana]);
const vocacional = await ins("INSERT INTO campanhas (nome, objetivo, inicio, fim, cor, status, responsavel_id, criado_por) VALUES ('Semana Vocacional','Despertar vocações','2027-04-12','2027-04-18','#3f6f8f','planejada',?,?)", [bruno, ana]);
await ins("INSERT INTO ideias (titulo, descricao, editoria_id, campanha_id, redes, prioridade, status, criado_por) VALUES ('Série: 5 minutos com a Palavra','Vídeos curtos com uma reflexão do Evangelho.',?,?, 'instagram,tiktok,youtube','alta','nova',?)", [ed.ev, advento, carla]);
await ins("INSERT INTO ideias (titulo, descricao, editoria_id, redes, prioridade, status, criado_por) VALUES ('Bastidores da missão','Fotos e vídeos da equipe em ação.',?, 'instagram','media','em_analise',?)", [ed.tes, bruno]);
await ins("INSERT INTO ideias (titulo, editoria_id, prioridade, status, criado_por) VALUES ('Mural de intenções',?, 'baixa','aprovada',?)", [ed.ins, carla]);
await ins("INSERT INTO datas_especiais (nome, dia, anual, criado_por) VALUES ('Aniversário da comunidade','2020-03-10',1,?)", [ana]);

/* ----- Biblioteca de mídia ----- */
const ids = {};
const dir = process.env.SEED_MIDIAS_DIR;
if (dir) {
  const storage = path.resolve(process.env.STORAGE_DIR || "storage");
  const pasta = await ins("INSERT INTO midia_pastas (nome, criado_por) VALUES ('Advento 2026', ?)", [ana]);
  for (const m of JSON.parse(await readFile(path.join(dir, "manifesto.json"), "utf8"))) {
    const dados = await readFile(path.join(dir, m.arquivo));
    const nome = randomBytes(16).toString("hex");
    await mkdir(path.join(storage, nome.slice(0, 2)), { recursive: true, mode: 0o700 });
    await copyFile(path.join(dir, m.arquivo), path.join(storage, nome.slice(0, 2), nome));
    ids[m.arquivo.replace(/\.[^.]+$/, "")] = await ins("INSERT INTO midias (arquivo, nome_original, mime, tipo, tamanho, sha256, largura, altura, pasta_id, descricao, texto_alternativo, criado_por) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
      [nome, m.nome, m.mime, m.tipo, dados.length, createHash("sha256").update(dados).digest("hex"), m.largura, m.altura, m.arquivo.includes("advento") || m.arquivo.includes("novena") ? pasta : null, null, m.tipo === "imagem" ? `Arte: ${m.nome.replace(/\..*/, "").replace(/-/g, " ")}` : null, ana]);
  }
  for (const e of ["advento", "natal"]) { await c.query("INSERT IGNORE INTO midia_etiquetas (nome) VALUES (?)", [e]); }
  if (ids["retiro-advento"]) await c.query("INSERT INTO midia_etiqueta_rel (midia_id, etiqueta_id) SELECT ?, id FROM midia_etiquetas WHERE nome IN ('advento')", [ids["retiro-advento"]]);
}

/* ----- Publicações ----- */
const redesDe = (r) => r.map((x) => (typeof x === "string" ? { rede: x } : x));
async function pub(o) {
  const id = await ins(
    `INSERT INTO publicacoes (titulo, descricao, objetivo, formato, status, campanha_id, editoria_id, responsavel_id, prioridade, prazo, publicar_em, legenda, hashtags, versao, criado_por, criado_em)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,1,?, UTC_TIMESTAMP())`,
    [o.titulo, o.descricao ?? null, o.objetivo ?? null, o.formato ?? "post", o.status, o.campanha ?? null, o.editoria ?? null, o.resp, o.prioridade ?? "media", o.prazo ?? null, o.quando ?? null, o.legenda ?? null, o.hashtags ?? "#NovaBerith", o.autor ?? o.resp]);
  for (const r of redesDe(o.redes ?? ["instagram"])) {
    await c.query("INSERT INTO publicacao_redes (publicacao_id, rede, envio, agendada_para, publicada_em, assistida, post_externo_id, url_externa, ultimo_erro, tentativas) VALUES (?,?,?,?,?,?,?,?,?,?)",
      [id, r.rede, r.envio ?? (o.status === "agendado" ? "agendada" : o.status === "publicado" ? "publicada" : "pendente"), (r.envio ?? o.status) === "agendada" || o.status === "agendado" ? o.quando : null, r.envio === "publicada" || (o.status === "publicado" && !r.envio) ? o.quando : null, r.assistida ?? 0, r.externo ?? null, r.url ?? null, r.erro ?? null, r.tentativas ?? 0]);
  }
  (o.midias ?? []).forEach((m, i) => ids[m] && c.query("INSERT INTO publicacao_midias (publicacao_id, midia_id, ordem) VALUES (?,?,?)", [id, ids[m], i]));
  const snap = JSON.stringify({ titulo: o.titulo, descricao: o.descricao ?? null, objetivo: o.objetivo ?? null, formato: o.formato ?? "post", legenda: o.legenda ?? null, hashtags: o.hashtags ?? "#NovaBerith", referencias: null, observacoes: null, redes: redesDe(o.redes ?? ["instagram"]).map((r) => ({ rede: r.rede, legenda: null, hashtags: null, tituloExterno: null })), midiaIds: (o.midias ?? []).map((m) => ids[m]).filter(Boolean) });
  await c.query("INSERT INTO publicacao_versoes (publicacao_id, versao, dados, motivo, autor_id) VALUES (?,1,?, 'Versão inicial', ?)", [id, snap, o.resp]);
  await c.query("INSERT INTO publicacao_historico (publicacao_id, user_id, acao, para_status) VALUES (?,?, 'criar', 'rascunho')", [id, o.resp]);
  if (["em_revisao", "ajustes_solicitados", "aprovado", "agendado", "publicado"].includes(o.status)) await c.query("INSERT INTO publicacao_historico (publicacao_id, user_id, acao, de_status, para_status) VALUES (?,?, 'status','em_producao','em_revisao')", [id, o.resp]);
  if (["aprovado", "agendado", "publicado"].includes(o.status)) {
    await c.query("INSERT INTO aprovacoes (publicacao_id, versao, decisao, user_id, comentario) VALUES (?,1,'aprovado',?, 'Aprovado.')", [id, davi]);
    await c.query("INSERT INTO publicacao_historico (publicacao_id, user_id, acao, de_status, para_status) VALUES (?,?, 'aprovar','em_revisao','aprovado')", [id, davi]);
  }
  return id;
}
const L = (t) => t.trim();
await pub({ titulo: "Convite: Retiro de Advento", formato: "carrossel", status: "agendado", redes: ["instagram", "facebook"], resp: bruno, campanha: advento, editoria: ed.evt, quando: loc(2, "19:00"), prazo: loc(1, "12:00"), midias: ["retiro-advento", "novena-natal"], legenda: L("Venha viver o Retiro de Advento com a comunidade! 🕯️\nInscrições abertas pelo link na bio."), hashtags: "#NovaBerith #Advento #Retiro", prioridade: "alta" });
await pub({ titulo: "Novena de Natal — dia 1", status: "em_revisao", redes: ["instagram"], resp: carla, campanha: advento, editoria: ed.ev, quando: loc(5, "19:00"), midias: ["novena-natal"], legenda: "Começa hoje a nossa Novena de Natal. Reze conosco!", hashtags: "#NovaBerith #Natal" });
await pub({ titulo: "Retiro em 60 segundos", formato: "video", status: "em_producao", redes: ["facebook", "tiktok", "youtube"], resp: bruno, campanha: advento, editoria: ed.evt, quando: loc(7, "12:00"), prazo: loc(3, "18:00"), midias: ["retiro-60s"], legenda: "Um resumo do último retiro em um minuto.", hashtags: "#NovaBerith #Retiro" });
await pub({ titulo: "Santa Missa de domingo", status: "aprovado", redes: ["facebook"], resp: carla, editoria: ed.ins, quando: loc(3, "12:00"), midias: ["missa-domingo"], legenda: "Domingo, às 18h30. Esperamos você!" });
await pub({ titulo: "Nossa Senhora Aparecida", status: "publicado", redes: [{ rede: "instagram", envio: "publicada", externo: "demo-ig-1" }, { rede: "facebook", envio: "publicada", assistida: 1 }], resp: bruno, editoria: ed.ev, quando: loc(-6, "12:00"), midias: ["nossa-senhora"], legenda: "Nossa Senhora Aparecida, rogai por nós! 🙏", hashtags: "#NovaBerith #NossaSenhoraAparecida" });
await pub({ titulo: "Testemunho: Maria", status: "publicado", redes: [{ rede: "instagram", envio: "publicada", externo: "demo-ig-2" }], resp: carla, editoria: ed.tes, quando: loc(-12, "19:00"), midias: ["testemunho"], legenda: "\"Deus me encontrou no caminho.\" Conheça a história da Maria." });
await pub({ titulo: "Frase do dia", formato: "stories", status: "rascunho", redes: ["instagram"], resp: carla, editoria: ed.ev, quando: loc(1, "08:00"), midias: ["frase-dia"] });
const aj = await pub({ titulo: "Bastidores da missão", status: "ajustes_solicitados", redes: ["instagram"], resp: bruno, editoria: ed.tes, quando: loc(9, "12:00"), midias: ["capa-quadrada"], legenda: "Um pouco do que vivemos nas missões." });
await c.query("INSERT INTO pub_comentarios (publicacao_id, user_id, texto, tipo) VALUES (?,?,'Trocar a imagem por uma foto real da missão e incluir o horário do encontro.','ajuste')", [aj, davi]);
await c.query("UPDATE publicacoes SET status='ajustes_solicitados' WHERE id=?", [aj]);
await pub({ titulo: "Aviso da secretaria", status: "agendado", redes: [{ rede: "instagram", envio: "publicada", externo: "demo-ig-3" }, { rede: "facebook", envio: "falhou", erro: "HTTP 400: imagem inválida (exemplo de falha de publicação)", tentativas: 1 }], resp: bruno, editoria: ed.ins, quando: loc(-1, "12:00"), midias: ["missa-domingo"], legenda: "Atenção ao novo horário da secretaria." });
for (let i = 0; i < 6; i++) await pub({ titulo: ["Oração da manhã", "Reflexão semanal", "Agenda da semana", "Dica de leitura", "Santo do mês", "Pedido de oração"][i], status: i % 2 ? "agendado" : "aprovado", redes: [i % 3 === 0 ? "facebook" : "instagram"], resp: i % 2 ? bruno : carla, editoria: ed.ev, quando: loc(10 + i * 3, i % 2 ? "12:00" : "19:00"), midias: [["frase-dia", "missa-domingo"][i % 2]], legenda: "Conteúdo de exemplo (dados fictícios para demonstração)." });

/* ----- Métricas fictícias (somente para visualizar os relatórios em desenvolvimento) ----- */
const [pr] = await c.query("SELECT r.id, r.rede FROM publicacao_redes r WHERE r.post_externo_id LIKE 'demo-%'");
for (const r of pr) await c.query("INSERT INTO metricas_publicacao (publicacao_rede_id, alcance, curtidas, comentarios, compartilhamentos, salvamentos, visualizacoes) VALUES (?,?,?,?,?,?,?)", [r.id, 1200 + r.id * 37, 85 + r.id * 3, 9, 14, 21, 2100]);
await c.query("INSERT INTO metricas_conta (rede, dia, seguidores) VALUES ('instagram', DATE_SUB(CURDATE(), INTERVAL 25 DAY), 2310), ('instagram', CURDATE(), 2384)");
await c.query("INSERT INTO notificacoes (user_id, tipo, titulo, corpo, url, dedupe_key) VALUES (?, 'aprovacao', 'Aguardando aprovação: Novena de Natal — dia 1', NULL, '/aprovacoes', 'seed:1')", [davi]);
await c.end();
console.log("Seed concluído. Senha de todos (exceto o administrador criado por você): Demo-Senha-12345");
