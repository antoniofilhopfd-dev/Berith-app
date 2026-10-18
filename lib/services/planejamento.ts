import type { RowDataPacket } from "mysql2/promise";
import { execute, query } from "@/lib/db";
import { assertCan } from "@/lib/permissions";
import { datasNoPeriodo, type DataEspecial } from "@/lib/datas";
import type { Rede } from "@/lib/editorial";
import { campanhaSchema, dataEspecialSchema, editoriaSchema, ideiaSchema } from "@/lib/validation/editorial";
import type { z } from "zod";
import { audit } from "./audit";
import { DomainError, NotFoundError } from "./errors";
import { criar as criarPublicacao } from "./publicacoes";
import type { PublicacaoInput } from "@/lib/validation/editorial";

/* ---------- Editorias ---------- */
export type Editoria = { id: number; nome: string; descricao: string | null; cor: string; ativa: number; publicacoes: number };
export async function listarEditorias(actor: number, incluirInativas = true): Promise<Editoria[]> {
  await assertCan(actor, "planejamento", "ver");
  return query<Editoria & RowDataPacket>(
    `SELECT e.*, (SELECT COUNT(*) FROM publicacoes p WHERE p.editoria_id = e.id) AS publicacoes FROM editorias e ${incluirInativas ? "" : "WHERE e.ativa = 1"} ORDER BY e.ativa DESC, e.nome`);
}
export async function salvarEditoria(actor: number, id: number | null, d: z.infer<typeof editoriaSchema>) {
  await assertCan(actor, "planejamento", id ? "editar" : "criar");
  const dup = await query<RowDataPacket>("SELECT id FROM editorias WHERE nome = ? AND id <> ?", [d.nome, id ?? 0]);
  if (dup.length) throw new DomainError("Já existe uma editoria com este nome.");
  if (id) { await execute("UPDATE editorias SET nome=?, descricao=?, cor=? WHERE id=?", [d.nome, d.descricao, d.cor, id]); }
  else { const r = await execute("INSERT INTO editorias (nome, descricao, cor) VALUES (?,?,?)", [d.nome, d.descricao, d.cor]); id = r.insertId; }
  await audit(actor, "editoria.salvar", { entidade: "editoria", entidadeId: id });
  return id;
}
export async function alternarEditoria(actor: number, id: number, ativa: boolean) {
  await assertCan(actor, "planejamento", "editar");
  await execute("UPDATE editorias SET ativa = ? WHERE id = ?", [ativa ? 1 : 0, id]);
  await audit(actor, "editoria.alternar", { entidade: "editoria", entidadeId: id, detalhes: { ativa } });
}

/* ---------- Campanhas ---------- */
export type Campanha = {
  id: number; nome: string; descricao: string | null; objetivo: string | null; inicio: string | null; fim: string | null; cor: string;
  status: "planejada" | "ativa" | "encerrada"; responsavel_id: number | null; responsavel_nome: string | null; total: number; publicadas: number;
};
const SEL_CAMP = `SELECT c.id, c.nome, c.descricao, c.objetivo, c.inicio, c.fim, c.cor, c.status, c.responsavel_id, u.nome AS responsavel_nome,
  (SELECT COUNT(*) FROM publicacoes p WHERE p.campanha_id = c.id AND p.status <> 'cancelado') AS total,
  (SELECT COUNT(*) FROM publicacoes p WHERE p.campanha_id = c.id AND p.status = 'publicado') AS publicadas
  FROM campanhas c LEFT JOIN users u ON u.id = c.responsavel_id`;
export async function listarCampanhas(actor: number): Promise<Campanha[]> {
  await assertCan(actor, "planejamento", "ver");
  return query<Campanha & RowDataPacket>(`${SEL_CAMP} ORDER BY FIELD(c.status,'ativa','planejada','encerrada'), c.inicio DESC, c.id DESC`);
}
export async function getCampanha(actor: number, id: number): Promise<Campanha> {
  await assertCan(actor, "planejamento", "ver");
  const r = (await query<Campanha & RowDataPacket>(`${SEL_CAMP} WHERE c.id = ?`, [id]))[0];
  if (!r) throw new NotFoundError();
  return r;
}
export async function salvarCampanha(actor: number, id: number | null, d: z.infer<typeof campanhaSchema>) {
  await assertCan(actor, "planejamento", id ? "editar" : "criar");
  if (d.responsavelId != null && !(await query<RowDataPacket>("SELECT 1 x FROM users WHERE id = ? AND status = 'ativo'", [d.responsavelId]))[0]) throw new DomainError("Responsável inexistente ou inativo.");
  if (id) {
    const r = await execute("UPDATE campanhas SET nome=?, descricao=?, objetivo=?, inicio=?, fim=?, cor=?, status=?, responsavel_id=? WHERE id=?",
      [d.nome, d.descricao, d.objetivo, d.inicio, d.fim, d.cor, d.status, d.responsavelId, id]);
    if (r.affectedRows === 0) throw new NotFoundError();
  } else {
    const r = await execute("INSERT INTO campanhas (nome, descricao, objetivo, inicio, fim, cor, status, responsavel_id, criado_por) VALUES (?,?,?,?,?,?,?,?,?)",
      [d.nome, d.descricao, d.objetivo, d.inicio, d.fim, d.cor, d.status, d.responsavelId, actor]);
    id = r.insertId;
  }
  await audit(actor, "campanha.salvar", { entidade: "campanha", entidadeId: id });
  return id;
}
export async function excluirCampanha(actor: number, id: number) {
  await assertCan(actor, "planejamento", "excluir");
  await execute("DELETE FROM campanhas WHERE id = ?", [id]); // publicações ficam sem campanha (FK SET NULL)
  await audit(actor, "campanha.excluir", { entidade: "campanha", entidadeId: id });
}

/* ---------- Ideias ---------- */
export type Ideia = {
  id: number; titulo: string; descricao: string | null; referencias: string | null; prioridade: "baixa" | "media" | "alta";
  status: "nova" | "em_analise" | "aprovada" | "descartada" | "convertida"; redes: string | null;
  editoria_id: number | null; editoria_nome: string | null; campanha_id: number | null; campanha_nome: string | null; publicacao_id: number | null; autor: string | null; criado_em: Date;
};
export async function listarIdeias(actor: number, status?: string): Promise<Ideia[]> {
  await assertCan(actor, "planejamento", "ver");
  return query<Ideia & RowDataPacket>(
    `SELECT i.*, e.nome AS editoria_nome, c.nome AS campanha_nome, u.nome AS autor FROM ideias i LEFT JOIN editorias e ON e.id = i.editoria_id
     LEFT JOIN campanhas c ON c.id = i.campanha_id LEFT JOIN users u ON u.id = i.criado_por ${status ? "WHERE i.status = ?" : ""}
     ORDER BY FIELD(i.status,'nova','em_analise','aprovada','convertida','descartada'), FIELD(i.prioridade,'alta','media','baixa'), i.id DESC LIMIT 300`, status ? [status] : []);
}
export async function criarIdeia(actor: number, d: z.infer<typeof ideiaSchema>) {
  await assertCan(actor, "planejamento", "criar");
  const r = await execute("INSERT INTO ideias (titulo, descricao, editoria_id, campanha_id, redes, prioridade, referencias, criado_por) VALUES (?,?,?,?,?,?,?,?)",
    [d.titulo, d.descricao, d.editoriaId, d.campanhaId, d.redes.join(",") || null, d.prioridade, d.referencias, actor]);
  await audit(actor, "ideia.criar", { entidade: "ideia", entidadeId: r.insertId });
  return r.insertId;
}
export async function decidirIdeia(actor: number, id: number, status: "em_analise" | "aprovada" | "descartada") {
  await assertCan(actor, "planejamento", "editar");
  const r = await execute("UPDATE ideias SET status = ? WHERE id = ? AND status <> 'convertida'", [status, id]);
  if (r.affectedRows === 0) throw new DomainError("Ideia não encontrada ou já convertida em produção.");
  await audit(actor, "ideia.status", { entidade: "ideia", entidadeId: id, detalhes: { status } });
}
export async function converterIdeia(actor: number, id: number): Promise<number> {
  await assertCan(actor, "planejamento", "editar");
  await assertCan(actor, "producao", "criar");
  const i = (await query<Ideia & RowDataPacket>("SELECT * FROM ideias WHERE id = ?", [id]))[0];
  if (!i) throw new NotFoundError();
  if (i.status === "convertida") throw new DomainError("Esta ideia já virou uma produção.");
  const redes = (i.redes ?? "").split(",").filter(Boolean) as Rede[];
  const d: PublicacaoInput = {
    titulo: i.titulo, descricao: i.descricao, objetivo: null, formato: "post", redes, campanhaId: i.campanha_id, editoriaId: i.editoria_id,
    responsavelId: actor, prioridade: i.prioridade, legenda: null, hashtags: null, referencias: i.referencias, observacoes: null, midiaIds: [], redesExtra: {},
  };
  const pubId = await criarPublicacao(actor, d, { prazo: null, publicarEm: null });
  await execute("UPDATE ideias SET status = 'convertida', publicacao_id = ? WHERE id = ?", [pubId, id]);
  await audit(actor, "ideia.converter", { entidade: "ideia", entidadeId: id, detalhes: { publicacaoId: pubId } });
  return pubId;
}

/* ---------- Datas ---------- */
export async function datasDoPeriodo(actor: number, de: string, ate: string): Promise<DataEspecial[]> {
  await assertCan(actor, "calendario", "ver");
  const proprias = await query<RowDataPacket>("SELECT nome, dia, anual FROM datas_especiais");
  return datasNoPeriodo(de, ate, proprias.map((p) => ({ nome: p.nome as string, dia: String(p.dia), anual: Boolean(p.anual) })));
}
export async function listarDatasProprias(actor: number) {
  await assertCan(actor, "planejamento", "ver");
  return query<RowDataPacket & { id: number; nome: string; dia: string; anual: number }>("SELECT id, nome, dia, anual FROM datas_especiais ORDER BY MONTH(dia), DAY(dia)");
}
export async function criarDataEspecial(actor: number, d: z.infer<typeof dataEspecialSchema>) {
  await assertCan(actor, "planejamento", "criar");
  const r = await execute("INSERT INTO datas_especiais (nome, dia, anual, criado_por) VALUES (?,?,?,?)", [d.nome, d.dia, d.anual ? 1 : 0, actor]);
  await audit(actor, "data_especial.criar", { entidade: "data_especial", entidadeId: r.insertId });
}
export async function excluirDataEspecial(actor: number, id: number) {
  await assertCan(actor, "planejamento", "excluir");
  await execute("DELETE FROM datas_especiais WHERE id = ?", [id]);
  await audit(actor, "data_especial.excluir", { entidade: "data_especial", entidadeId: id });
}
