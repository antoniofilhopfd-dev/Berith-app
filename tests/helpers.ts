import mysql from "mysql2/promise";
import { dbConfig, closePool, ensureReady, execute } from "@/lib/db";
import type { PublicacaoInput } from "@/lib/validation/editorial";

export async function resetTestDb() {
  const cfg = dbConfig();
  if (!cfg.database.endsWith("_test")) throw new Error("Recusado: só zera bancos terminados em _test");
  await closePool();
  const c = await mysql.createConnection({ ...cfg });
  await c.query("SET FOREIGN_KEY_CHECKS = 0");
  const [rows] = await c.query<mysql.RowDataPacket[]>("SELECT table_name AS t FROM information_schema.tables WHERE table_schema = ?", [cfg.database]);
  for (const r of rows) await c.query(`DROP TABLE IF EXISTS \`${r.t}\``);
  await c.query("SET FOREIGN_KEY_CHECKS = 1");
  await c.end();
  await ensureReady();
}

export async function criarUsuario(email: string, nome = "Teste") {
  const r = await execute("INSERT INTO users (nome, email, senha_hash, status) VALUES (?, ?, 'x', 'ativo')", [nome, email]);
  return r.insertId;
}
/** Atribui um perfil global (admin, coordenador, integrante, aprovador). */
export async function darPerfil(userId: number, codigo: string) {
  await execute("INSERT INTO user_roles (user_id, role_id, scope_unit_id, scope_unit_id_key) SELECT ?, id, NULL, 0 FROM roles WHERE codigo = ?", [userId, codigo]);
}

/** Pessoas de cada perfil, já criadas. */
export async function equipePadrao() {
  const admin = await criarUsuario(`admin${Date.now()}@t.com`, "Admin");
  const coord = await criarUsuario(`coord${Date.now()}@t.com`, "Coordenadora");
  const integ = await criarUsuario(`integ${Date.now()}@t.com`, "Integrante");
  const integ2 = await criarUsuario(`integ2${Date.now()}@t.com`, "Integrante 2");
  const aprov = await criarUsuario(`aprov${Date.now()}@t.com`, "Aprovador");
  const semPerfil = await criarUsuario(`sem${Date.now()}@t.com`, "Sem perfil");
  await darPerfil(admin, "admin"); await darPerfil(coord, "coordenador"); await darPerfil(integ, "integrante"); await darPerfil(integ2, "integrante"); await darPerfil(aprov, "aprovador");
  return { admin, coord, integ, integ2, aprov, semPerfil };
}

export const pubBase = (o: Partial<PublicacaoInput> = {}): PublicacaoInput => ({
  titulo: "Post de teste", descricao: null, objetivo: null, formato: "post", redes: ["instagram"], campanhaId: null, editoriaId: null, responsavelId: null,
  prioridade: "media", legenda: "Legenda de teste", hashtags: "#teste", referencias: null, observacoes: null, midiaIds: [], redesExtra: {}, ...o,
});

/** Mídia de imagem fictícia na biblioteca (sem arquivo real; suficiente para vínculos). */
let seq = 0;
export async function criarMidia(userId: number, tipo: "imagem" | "video" = "imagem", mime?: string) {
  seq++;
  const arquivo = (Date.now().toString(16) + seq.toString(16)).padStart(32, "0").slice(-32);
  const sha = (seq.toString(16) + Date.now().toString(16)).padStart(64, "a").slice(-64);
  const r = await execute("INSERT INTO midias (arquivo, nome_original, mime, tipo, tamanho, sha256, largura, altura, criado_por) VALUES (?,?,?,?,?,?,?,?,?)",
    [arquivo, `arquivo${seq}.${tipo === "imagem" ? "jpg" : "mp4"}`, mime ?? (tipo === "imagem" ? "image/jpeg" : "video/mp4"), tipo, 1000, sha, 1080, 1350, userId]);
  return r.insertId;
}
