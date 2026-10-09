"use server";

import { z } from "zod";
import { guarded } from "@/lib/auth/guard";
import { excluirArquivo } from "@/lib/services/arquivos";

export const excluirArquivoAction = guarded(async (u, f) => {
  await excluirArquivo(u.id, z.coerce.number().int().positive().parse(f.get("id")));
  return { ok: "Arquivo removido." };
}, ["/comunicados", "/tarefas", "/formacao", "/midia"]);
