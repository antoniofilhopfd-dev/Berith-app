// Retenção e descarte (LGPD): remove dados vencidos. Seguro para rodar diariamente (cron). Uso: npm run manutencao
// Não toca em lançamentos financeiros nem na auditoria (retenção legal). Parâmetros opcionais por variável de ambiente.
import { pathToFileURL } from "node:url";
import mysql from "mysql2/promise";

export const RETENCAO_DIAS = { sessoes: 30, tentativasLogin: 30, tokens: 30, notificacoesLidas: 180, entregasPush: 90 };

export async function manutencao(conn, dias = RETENCAO_DIAS) {
  const q = async (sql, p = []) => (await conn.query(sql, p))[0].affectedRows;
  const r = {};
  r.sessoes = await q("DELETE FROM sessions WHERE (expira_em < DATE_SUB(UTC_TIMESTAMP(), INTERVAL ? DAY)) OR (revogada_em IS NOT NULL AND revogada_em < DATE_SUB(UTC_TIMESTAMP(), INTERVAL ? DAY))", [dias.sessoes, dias.sessoes]);
  r.tentativasLogin = await q("DELETE FROM login_attempts WHERE criado_em < DATE_SUB(UTC_TIMESTAMP(), INTERVAL ? DAY)", [dias.tentativasLogin]);
  r.redefinicoesDeSenha = await q("DELETE FROM password_resets WHERE (usado_em IS NOT NULL OR expira_em < UTC_TIMESTAMP()) AND criado_em < DATE_SUB(UTC_TIMESTAMP(), INTERVAL ? DAY)", [dias.tokens]);
  r.convitesVencidos = await q("DELETE FROM invitations WHERE aceito_em IS NULL AND expira_em < DATE_SUB(UTC_TIMESTAMP(), INTERVAL ? DAY)", [dias.tokens]);
  r.notificacoesLidas = await q("DELETE FROM notificacoes WHERE lida_em IS NOT NULL AND lida_em < DATE_SUB(UTC_TIMESTAMP(), INTERVAL ? DAY)", [dias.notificacoesLidas]);
  r.entregasPush = await q("DELETE FROM push_entregas WHERE criado_em < DATE_SUB(UTC_TIMESTAMP(), INTERVAL ? DAY)", [dias.entregasPush]);
  return r;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const conn = await mysql.createConnection({ host: process.env.DB_HOST, port: Number(process.env.DB_PORT ?? 3306), database: process.env.DB_NAME, user: process.env.DB_USER, password: process.env.DB_PASSWORD });
  try { console.log("Manutenção concluída:", JSON.stringify(await manutencao(conn))); } finally { await conn.end(); }
}
