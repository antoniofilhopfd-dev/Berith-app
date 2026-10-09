"use server";

import { redirect } from "next/navigation";
import { guarded } from "@/lib/auth/guard";
import { albumSchema, idSchema } from "@/lib/validation/formacao";
import { criarAlbum, excluirAlbum } from "@/lib/services/arquivos";

export const criarAlbumAction = guarded(async (u, f) => {
  const id = await criarAlbum(u.id, albumSchema.parse(Object.fromEntries(f)));
  redirect(`/midia/albuns/${id}`);
}, ["/midia"]);

export const excluirAlbumAction = guarded(async (u, f) => {
  await excluirAlbum(u.id, idSchema.parse(f.get("id")));
  redirect("/midia");
}, ["/midia"]);
