"use server";

import { z } from "zod";
import { guarded } from "@/lib/auth/guard";
import { fonteSchema, itemLiturgiaSchema } from "@/lib/validation/liturgia";
import { adicionarFonte, excluirItem, removerFonte, salvarItem } from "@/lib/services/liturgia";

const P = ["/liturgia", "/"];
const id = z.coerce.number().int().positive();

export const salvarLiturgiaAction = guarded(async (u, f) => {
  await salvarItem(u.id, itemLiturgiaSchema.parse(Object.fromEntries(f)));
  return { ok: "Conteúdo salvo." };
}, P);

export const excluirLiturgiaAction = guarded(async (u, f) => {
  await excluirItem(u.id, id.parse(f.get("id")));
  return { ok: "Conteúdo removido." };
}, P);

export const adicionarFonteAction = guarded(async (u, f) => {
  await adicionarFonte(u.id, fonteSchema.parse(Object.fromEntries(f)));
  return { ok: "Fonte adicionada." };
}, ["/liturgia"]);

export const removerFonteAction = guarded(async (u, f) => {
  await removerFonte(u.id, id.parse(f.get("id")));
  return { ok: "Fonte removida." };
}, ["/liturgia"]);
