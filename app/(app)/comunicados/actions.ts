"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { guarded } from "@/lib/auth/guard";
import { comunicadoSchema } from "@/lib/validation/eventos";
import { confirmRead, createComunicado, deleteComunicado } from "@/lib/services/comunicados";

const id = z.coerce.number().int().positive();

export const publicarComunicadoAction = guarded(async (u, f) => {
  await createComunicado(u.id, comunicadoSchema.parse(Object.fromEntries(f)));
  return { ok: "Comunicado salvo." };
}, ["/comunicados", "/"]);

export const confirmarLeituraAction = guarded(async (u, f) => {
  await confirmRead(u.id, id.parse(f.get("id")));
  return { ok: "Leitura confirmada. Obrigado!" };
}, ["/comunicados", "/"]);

export const excluirComunicadoAction = guarded(async (u, f) => {
  await deleteComunicado(u.id, id.parse(f.get("id")));
  redirect("/comunicados");
}, ["/comunicados", "/"]);
