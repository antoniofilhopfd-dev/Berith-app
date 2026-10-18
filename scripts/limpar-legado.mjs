// Descarta as tabelas da antiga versão comunitária do app (membros, escalas, financeiro, liturgia, etc.).
// SEGURO POR PADRÃO: sem opções apenas LISTA o que existe e quantas linhas cada tabela tem (nada é alterado).
//   npm run limpar:legado                              → relatório (dry-run)
//   npm run limpar:legado -- --apagar-vazias           → remove só as tabelas legadas que estão VAZIAS
//   npm run limpar:legado -- --apagar-tudo --confirmo-backup
//        → remove também as que têm dados. IRREVERSÍVEL: faça e confira o backup antes (scripts/backup.sh).
// Nunca toca em users, sessions, roles, audit_log, settings, notificações, mídia, publicações e demais tabelas atuais.
import { pathToFileURL } from "node:url";
import mysql from "mysql2/promise";

/** Em ordem segura de remoção (filhas antes das mães). */
export const LEGADO = [
  "liturgia_importados", "liturgia_provedor", "liturgia_fontes", "liturgia_itens",
  "fin_conciliacoes", "fin_periodos", "fin_lancamentos", "fin_categorias", "fin_contas",
  "conteudo_concluidos", "conteudo_favoritos", "trilha_itens", "trilhas", "conteudos",
  "meeting_decisions", "meeting_participants", "meetings", "task_history", "task_comments", "tasks",
  "attendance_corrections", "attendance", "user_unavailability", "shift_assignments", "shifts",
  "announcement_reads", "announcements", "event_history", "event_rsvps", "event_exceptions", "events",
  "files", "albums", "invitation_units", "memberships", "org_units",
];

export async function planejar(conn) {
  const [existentes] = await conn.query("SELECT table_name AS t FROM information_schema.tables WHERE table_schema = DATABASE()");
  const nomes = new Set(existentes.map((x) => x.t ?? x.TABLE_NAME));
  const out = [];
  for (const t of LEGADO) if (nomes.has(t)) { const [[{ n }]] = await conn.query(`SELECT COUNT(*) n FROM \`${t}\``); out.push({ tabela: t, linhas: Number(n) }); }
  return out;
}

export async function limpar(conn, { apagarVazias = false, apagarTudo = false } = {}) {
  const plano = await planejar(conn);
  const removidas = [], mantidas = [];
  // org_units é referenciada por user_roles (escopo): só remove se nenhuma função de escopo restar.
  await conn.query("SET FOREIGN_KEY_CHECKS = 0");
  try {
    for (const p of plano) {
      if ((p.linhas === 0 && (apagarVazias || apagarTudo)) || (p.linhas > 0 && apagarTudo)) { await conn.query(`DROP TABLE \`${p.tabela}\``); removidas.push(p); }
      else mantidas.push(p);
    }
  } finally { await conn.query("SET FOREIGN_KEY_CHECKS = 1"); }
  return { removidas, mantidas };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const args = process.argv.slice(2);
  const apagarVazias = args.includes("--apagar-vazias"), apagarTudo = args.includes("--apagar-tudo");
  if (apagarTudo && !args.includes("--confirmo-backup")) { console.error("--apagar-tudo exige --confirmo-backup (confirme que fez e conferiu o backup)."); process.exit(1); }
  if (process.env.NODE_ENV === "production" && apagarTudo && process.env.PERMITIR_APAGAR_LEGADO !== "sim") { console.error("Em produção, defina também PERMITIR_APAGAR_LEGADO=sim para apagar tabelas com dados."); process.exit(1); }
  const conn = await mysql.createConnection({ host: process.env.DB_HOST, port: Number(process.env.DB_PORT ?? 3306), database: process.env.DB_NAME, user: process.env.DB_USER, password: process.env.DB_PASSWORD });
  try {
    if (!apagarVazias && !apagarTudo) {
      const plano = await planejar(conn);
      console.log(plano.length ? "Tabelas legadas encontradas (nada foi alterado):" : "Nenhuma tabela legada encontrada.");
      for (const p of plano) console.log(`  ${p.tabela.padEnd(26)} ${p.linhas} linha(s)`);
      if (plano.length) console.log("\nUse --apagar-vazias para remover só as vazias, ou --apagar-tudo --confirmo-backup para remover todas (após backup).");
    } else {
      const r = await limpar(conn, { apagarVazias, apagarTudo });
      console.log(`Removidas: ${r.removidas.map((x) => x.tabela).join(", ") || "nenhuma"}`);
      if (r.mantidas.length) console.log(`Mantidas (têm dados): ${r.mantidas.map((x) => `${x.tabela}(${x.linhas})`).join(", ")}`);
    }
  } finally { await conn.end(); }
}
