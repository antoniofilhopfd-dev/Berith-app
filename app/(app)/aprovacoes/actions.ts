"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { guarded } from "@/lib/auth/guard";
import { decidir } from "@/lib/services/publicacoes";

export const decidirAction = guarded(async (u, f) => {
  const id = z.coerce.number().int().positive().parse(f.get("id"));
  const decisao = z.enum(["aprovado", "ajustes"]).parse(f.get("decisao"));
  const comentario = String(f.get("comentario") ?? "").trim().slice(0, 3000) || null;
  await decidir(u.id, id, decisao, comentario);
  redirect("/aprovacoes");
}, ["/aprovacoes", "/producao", "/"]);
