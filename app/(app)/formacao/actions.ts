"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { guarded } from "@/lib/auth/guard";
import { conteudoSchema, idSchema, trilhaSchema } from "@/lib/validation/formacao";
import { alternarConcluido, alternarFavorito, criarConteudo, criarTrilha, editarConteudo, excluirConteudo, excluirTrilha } from "@/lib/services/formacao";

const P = ["/formacao", "/"];
const obj = (f: FormData) => Object.fromEntries(f);

export const criarConteudoAction = guarded(async (u, f) => {
  const id = await criarConteudo(u.id, conteudoSchema.parse(obj(f)));
  redirect(`/formacao/${id}`);
}, P);

export const editarConteudoAction = guarded(async (u, f) => {
  const o = obj(f);
  await editarConteudo(u.id, idSchema.parse(o.id), conteudoSchema.parse(o));
  redirect(`/formacao/${o.id}`);
}, P);

export const excluirConteudoAction = guarded(async (u, f) => {
  await excluirConteudo(u.id, idSchema.parse(f.get("id")));
  redirect("/formacao");
}, P);

export const favoritoAction = guarded(async (u, f) => {
  const fav = await alternarFavorito(u.id, idSchema.parse(f.get("id")));
  return { ok: fav ? "Adicionado aos favoritos." : "Removido dos favoritos." };
}, ["/formacao"]);

export const concluidoAction = guarded(async (u, f) => {
  const ok = await alternarConcluido(u.id, idSchema.parse(f.get("id")));
  return { ok: ok ? "Marcado como concluído." : "Marcado como não concluído." };
}, ["/formacao"]);

export const criarTrilhaAction = guarded(async (u, f) => {
  const o = obj(f);
  const ids = f.getAll("conteudo").map((v) => idSchema.parse(v));
  if (ids.length === 0) throw new z.ZodError([{ code: "custom", message: "Escolha ao menos um conteúdo.", path: [] }]);
  const id = await criarTrilha(u.id, trilhaSchema.parse(o), ids);
  redirect(`/formacao/trilhas/${id}`);
}, P);

export const excluirTrilhaAction = guarded(async (u, f) => {
  await excluirTrilha(u.id, idSchema.parse(f.get("id")));
  redirect("/formacao");
}, P);
