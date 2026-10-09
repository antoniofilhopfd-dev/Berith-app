import type { RowDataPacket } from "mysql2/promise";
import { execute, query } from "@/lib/db";
import { assertCan, can } from "@/lib/permissions";
import type { z } from "zod";
import type { itemLiturgiaSchema, fonteSchema, TipoLiturgia } from "@/lib/validation/liturgia";
import { DomainError, NotFoundError } from "./errors";
import { audit } from "./audit";

export type ItemLiturgia = {
  id: number; data: string; tipo: TipoLiturgia; titulo: string; texto: string | null;
  fonte_nome: string; fonte_url: string | null; direitos: string | null; atualizado_em: Date;
};

/** Leitura aberta a qualquer membro ativo autenticado (a página já exige sessão). */
export async function itensDoDia(data: string): Promise<ItemLiturgia[]> {
  return query<ItemLiturgia & RowDataPacket>(
    "SELECT id, data, tipo, titulo, texto, fonte_nome, fonte_url, direitos, atualizado_em FROM liturgia_itens WHERE data = ?", [data]);
}

export const podeEditarLiturgia = (actor: number) => can(actor, "conteudos", "editar", null);

/** Cria (permissão "criar") ou atualiza (permissão "editar") o item do dia/tipo. */
export async function salvarItem(actor: number, d: z.infer<typeof itemLiturgiaSchema>) {
  const ex = await query<RowDataPacket>("SELECT id FROM liturgia_itens WHERE data = ? AND tipo = ?", [d.data, d.tipo]);
  await assertCan(actor, "conteudos", ex[0] ? "editar" : "criar", null);
  if (ex[0]) {
    await execute(
      "UPDATE liturgia_itens SET titulo=?, texto=?, fonte_nome=?, fonte_url=?, direitos=?, atualizado_por=? WHERE id=?",
      [d.titulo, d.texto, d.fonteNome, d.fonteUrl ?? null, d.direitos, actor, ex[0].id]);
  } else {
    await execute(
      "INSERT INTO liturgia_itens (data, tipo, titulo, texto, fonte_nome, fonte_url, direitos, criado_por) VALUES (?,?,?,?,?,?,?,?)",
      [d.data, d.tipo, d.titulo, d.texto, d.fonteNome, d.fonteUrl ?? null, d.direitos, actor]);
  }
  await audit(actor, ex[0] ? "liturgia.editar" : "liturgia.criar", { entidade: "liturgia", detalhes: { data: d.data, tipo: d.tipo, fonte: d.fonteNome } });
}

export async function excluirItem(actor: number, id: number) {
  await assertCan(actor, "conteudos", "excluir", null);
  const r = await execute("DELETE FROM liturgia_itens WHERE id = ?", [id]);
  if (r.affectedRows === 0) throw new NotFoundError();
  await audit(actor, "liturgia.excluir", { entidade: "liturgia", entidadeId: id });
}

export const listarFontes = () => query<RowDataPacket & { id: number; titulo: string; url: string }>("SELECT id, titulo, url FROM liturgia_fontes ORDER BY id");

export async function adicionarFonte(actor: number, d: z.infer<typeof fonteSchema>) {
  await assertCan(actor, "conteudos", "editar", null);
  const n = await query<RowDataPacket>("SELECT COUNT(*) n FROM liturgia_fontes");
  if (Number(n[0].n) >= 20) throw new DomainError("Limite de 20 fontes atingido.");
  await execute("INSERT INTO liturgia_fontes (titulo, url, criado_por) VALUES (?,?,?)", [d.titulo, d.url, actor]);
  await audit(actor, "liturgia.fonte_adicionar", { detalhes: { url: d.url } });
}

export async function removerFonte(actor: number, id: number) {
  await assertCan(actor, "conteudos", "editar", null);
  await execute("DELETE FROM liturgia_fontes WHERE id = ?", [id]);
  await audit(actor, "liturgia.fonte_remover", { entidade: "liturgia_fonte", entidadeId: id });
}
