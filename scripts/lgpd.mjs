// Direitos do titular (LGPD). Uso:
//   npm run lgpd -- exportar  pessoa@exemplo.com            → JSON com os dados pessoais da pessoa (stdout)
//   npm run lgpd -- anonimizar pessoa@exemplo.com --confirmo → remove identificação e dados de acesso; mantém o registro editorial
// O histórico editorial (publicações, aprovações, auditoria) é preservado, mas a pessoa deixa de ser identificável.
import { pathToFileURL } from "node:url";
import mysql from "mysql2/promise";

const sel = async (c, sql, p) => (await c.query(sql, p))[0];

export async function exportarDados(conn, email) {
  const [u] = await sel(conn, "SELECT id, nome, email, status, criado_em FROM users WHERE email = ?", [String(email).toLowerCase()]);
  if (!u) return null;
  const id = u.id;
  return {
    geradoEm: new Date().toISOString(), pessoa: u,
    perfil: (await sel(conn, "SELECT telefone, situacao FROM member_profiles WHERE user_id = ?", [id]))[0] ?? null,
    perfisDeAcesso: await sel(conn, "SELECT r.nome AS perfil FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = ?", [id]),
    publicacoesCriadas: await sel(conn, "SELECT id, titulo, status, criado_em FROM publicacoes WHERE criado_por = ?", [id]),
    publicacoesSobResponsabilidade: await sel(conn, "SELECT id, titulo, status, prazo FROM publicacoes WHERE responsavel_id = ?", [id]),
    comentarios: await sel(conn, "SELECT publicacao_id, tipo, texto, criado_em FROM pub_comentarios WHERE user_id = ?", [id]),
    decisoesDeAprovacao: await sel(conn, "SELECT publicacao_id, versao, decisao, criado_em FROM aprovacoes WHERE user_id = ?", [id]),
    midiasEnviadas: (await sel(conn, "SELECT COUNT(*) n FROM midias WHERE criado_por = ?", [id]))[0].n,
    notificacoes: (await sel(conn, "SELECT COUNT(*) n FROM notificacoes WHERE user_id = ?", [id]))[0].n,
    dispositivosPush: (await sel(conn, "SELECT COUNT(*) n FROM push_subscriptions WHERE user_id = ?", [id]))[0].n,
    acoesRegistradasNaAuditoria: (await sel(conn, "SELECT COUNT(*) n FROM audit_log WHERE user_id = ?", [id]))[0].n,
  };
}

export async function anonimizar(conn, email) {
  const [u] = await sel(conn, "SELECT id FROM users WHERE email = ?", [String(email).toLowerCase()]);
  if (!u) return { ok: false, motivo: "Pessoa não encontrada." };
  const id = u.id;
  const [adm] = await sel(conn, "SELECT COUNT(*) n FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = ? AND r.codigo = 'admin'", [id]);
  if (Number(adm.n) > 0) return { ok: false, motivo: "Retire antes o perfil de administrador." };
  await conn.beginTransaction();
  try {
    await conn.query("UPDATE users SET nome = ?, email = ?, senha_hash = '!', status = 'suspenso', acesso_hmac = NULL, acesso_enc = NULL WHERE id = ?", [`Membro removido nº ${id}`, `removido+${id}@invalido.invalid`, id]);
    for (const t of ["sessions", "push_subscriptions", "notificacoes", "notificacao_config", "notificacao_tipos", "member_profiles", "password_resets", "user_roles", "oauth_estados", "dispositivos_conhecidos"])
      await conn.query(`DELETE FROM ${t} WHERE user_id = ?`, [id]);
    await conn.query("UPDATE publicacoes SET responsavel_id = NULL WHERE responsavel_id = ? AND status IN ('rascunho','em_producao','ajustes_solicitados','em_revisao')", [id]);
    await conn.query("INSERT INTO audit_log (user_id, acao, entidade, entidade_id) VALUES (NULL, 'lgpd.anonimizar', 'user', ?)", [String(id)]);
    await conn.commit();
  } catch (e) { await conn.rollback(); throw e; }
  return { ok: true, id };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const [acao, email, flag] = process.argv.slice(2);
  if (!["exportar", "anonimizar"].includes(acao) || !email) { console.error("Uso: npm run lgpd -- <exportar|anonimizar> <email> [--confirmo]"); process.exit(1); }
  if (acao === "anonimizar" && flag !== "--confirmo") { console.error("Operação irreversível. Repita com --confirmo."); process.exit(1); }
  const conn = await mysql.createConnection({ host: process.env.DB_HOST, port: Number(process.env.DB_PORT ?? 3306), database: process.env.DB_NAME, user: process.env.DB_USER, password: process.env.DB_PASSWORD });
  try { console.log(JSON.stringify(acao === "exportar" ? await exportarDados(conn, email) : await anonimizar(conn, email), null, 2)); } finally { await conn.end(); }
}
