// Direitos do titular (LGPD). Uso:
//   npm run lgpd -- exportar  pessoa@exemplo.com            → JSON com os dados pessoais da pessoa (stdout)
//   npm run lgpd -- anonimizar pessoa@exemplo.com --confirmo → remove identificação e dados de uso; mantém o que a lei exige
// Lançamentos financeiros e auditoria são preservados (obrigação legal), mas a pessoa deixa de ser identificável.
import { pathToFileURL } from "node:url";
import mysql from "mysql2/promise";

const sel = async (c, sql, p) => (await c.query(sql, p))[0];

export async function exportarDados(conn, email) {
  const [u] = await sel(conn, "SELECT id, nome, email, status, criado_em FROM users WHERE email = ?", [String(email).toLowerCase()]);
  if (!u) return null;
  const id = u.id;
  return {
    geradoEm: new Date().toISOString(), pessoa: u,
    perfil: (await sel(conn, "SELECT telefone, situacao, autoriza_imagem FROM member_profiles WHERE user_id = ?", [id]))[0] ?? null,
    vinculos: await sel(conn, "SELECT o.nome AS estrutura, m.funcao, m.inicio, m.fim FROM memberships m JOIN org_units o ON o.id = m.unit_id WHERE m.user_id = ?", [id]),
    papeis: await sel(conn, "SELECT r.nome AS papel, o.nome AS estrutura FROM user_roles ur JOIN roles r ON r.id = ur.role_id LEFT JOIN org_units o ON o.id = ur.scope_unit_id WHERE ur.user_id = ?", [id]),
    confirmacoesEmEventos: await sel(conn, "SELECT e.titulo, r.occurrence_date AS data, r.status FROM event_rsvps r JOIN events e ON e.id = r.event_id WHERE r.user_id = ?", [id]),
    presencas: await sel(conn, "SELECT e.titulo, a.occurrence_date AS data, a.presente FROM attendance a JOIN events e ON e.id = a.event_id WHERE a.user_id = ?", [id]),
    escalas: await sel(conn, "SELECT s.titulo, s.inicio, a.funcao, a.status FROM shift_assignments a JOIN shifts s ON s.id = a.shift_id WHERE a.user_id = ?", [id]),
    tarefasResponsavel: await sel(conn, "SELECT titulo, prazo, status FROM tasks WHERE responsavel_id = ?", [id]),
    contribuicoes: await sel(conn, "SELECT data, valor_centavos, status FROM fin_lancamentos WHERE doador_user_id = ?", [id]),
    notificacoes: (await sel(conn, "SELECT COUNT(*) n FROM notificacoes WHERE user_id = ?", [id]))[0].n,
    dispositivosPush: (await sel(conn, "SELECT COUNT(*) n FROM push_subscriptions WHERE user_id = ?", [id]))[0].n,
    favoritosEConcluidos: { favoritos: (await sel(conn, "SELECT COUNT(*) n FROM conteudo_favoritos WHERE user_id = ?", [id]))[0].n, concluidos: (await sel(conn, "SELECT COUNT(*) n FROM conteudo_concluidos WHERE user_id = ?", [id]))[0].n },
    acoesRegistradasNaAuditoria: (await sel(conn, "SELECT COUNT(*) n FROM audit_log WHERE user_id = ?", [id]))[0].n,
  };
}

export async function anonimizar(conn, email) {
  const [u] = await sel(conn, "SELECT id FROM users WHERE email = ?", [String(email).toLowerCase()]);
  if (!u) return { ok: false, motivo: "Pessoa não encontrada." };
  const id = u.id;
  const [adm] = await sel(conn, "SELECT COUNT(*) n FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = ? AND r.codigo = 'admin_geral'", [id]);
  if (Number(adm.n) > 0) return { ok: false, motivo: "Retire antes a função de administrador geral." };
  await conn.beginTransaction();
  try {
    await conn.query("UPDATE users SET nome = ?, email = ?, senha_hash = '!', status = 'suspenso' WHERE id = ?", [`Membro removido nº ${id}`, `removido+${id}@invalido.invalid`, id]);
    for (const t of ["sessions", "push_subscriptions", "notificacoes", "notificacao_config", "notificacao_tipos", "member_profiles", "conteudo_favoritos", "conteudo_concluidos", "event_rsvps", "attendance", "user_unavailability", "meeting_participants", "password_resets", "user_roles"])
      await conn.query(`DELETE FROM ${t} WHERE user_id = ?`, [id]);
    await conn.query("UPDATE memberships SET fim = COALESCE(fim, UTC_DATE()) WHERE user_id = ?", [id]);
    await conn.query("UPDATE shift_assignments SET status = 'substituido' WHERE user_id = ? AND status IN ('pendente','confirmado')", [id]);
    await conn.query("UPDATE tasks SET responsavel_id = NULL WHERE responsavel_id = ? AND status IN ('aberta','em_andamento')", [id]);
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
