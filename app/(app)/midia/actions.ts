"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { guarded } from "@/lib/auth/guard";
import * as M from "@/lib/services/midia";

const id = z.coerce.number().int().positive();
const opt = (v: FormDataEntryValue | null) => { const s = typeof v === "string" ? v.trim() : ""; return s ? s : null; };

export const criarPastaAction = guarded(async (u, f) => {
  const pai = f.get("paiId") ? id.parse(f.get("paiId")) : null;
  await M.criarPasta(u.id, String(f.get("nome") ?? ""), pai);
  return { ok: "Pasta criada." };
}, ["/midia"]);
export const excluirPastaAction = guarded(async (u, f) => { await M.excluirPasta(u.id, id.parse(f.get("id"))); redirect("/midia"); }, ["/midia"]);

export const atualizarMidiaAction = guarded(async (u, f) => {
  const pasta = opt(f.get("pastaId"));
  await M.atualizarMidia(u.id, id.parse(f.get("id")), {
    descricao: opt(f.get("descricao"))?.slice(0, 300) ?? null, textoAlternativo: opt(f.get("textoAlternativo"))?.slice(0, 300) ?? null,
    pastaId: pasta ? id.parse(pasta) : null, etiquetas: String(f.get("etiquetas") ?? "").split(/[,;\n]/).map((s) => s.trim()).filter(Boolean),
  });
  return { ok: "Mídia atualizada." };
}, ["/midia"]);
export const removerMidiaAction = guarded(async (u, f) => { await M.removerMidia(u.id, id.parse(f.get("id"))); redirect("/midia"); }, ["/midia"]);
