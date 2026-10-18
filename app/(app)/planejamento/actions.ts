"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { guarded } from "@/lib/auth/guard";
import { campanhaSchema, dataEspecialSchema, editoriaSchema, ideiaSchema } from "@/lib/validation/editorial";
import * as PL from "@/lib/services/planejamento";

const id = z.coerce.number().int().positive();
const CAM = ["/planejamento", "/producao", "/calendario", "/"];
const g = (f: FormData, k: string) => { const v = f.get(k); return typeof v === "string" ? v : ""; };

export const salvarCampanhaAction = guarded(async (u, f) => {
  const d = campanhaSchema.parse({ nome: g(f, "nome"), descricao: g(f, "descricao"), objetivo: g(f, "objetivo"), inicio: g(f, "inicio"), fim: g(f, "fim"), cor: g(f, "cor") || undefined, status: g(f, "status") || undefined, responsavelId: g(f, "responsavelId") });
  await PL.salvarCampanha(u.id, f.get("id") ? id.parse(f.get("id")) : null, d);
  return { ok: "Campanha salva." };
}, CAM);
export const excluirCampanhaAction = guarded(async (u, f) => { await PL.excluirCampanha(u.id, id.parse(f.get("id"))); return { ok: "Campanha excluída; as publicações foram mantidas." }; }, CAM);

export const salvarEditoriaAction = guarded(async (u, f) => {
  const d = editoriaSchema.parse({ nome: g(f, "nome"), descricao: g(f, "descricao"), cor: g(f, "cor") || undefined });
  await PL.salvarEditoria(u.id, f.get("id") ? id.parse(f.get("id")) : null, d);
  return { ok: "Editoria salva." };
}, CAM);
export const alternarEditoriaAction = guarded(async (u, f) => { await PL.alternarEditoria(u.id, id.parse(f.get("id")), f.get("ativa") === "1"); return { ok: "Atualizado." }; }, CAM);

export const criarIdeiaAction = guarded(async (u, f) => {
  const d = ideiaSchema.parse({ titulo: g(f, "titulo"), descricao: g(f, "descricao"), referencias: g(f, "referencias"), editoriaId: g(f, "editoriaId"), campanhaId: g(f, "campanhaId"), prioridade: g(f, "prioridade") || undefined, redes: f.getAll("redes").map(String) });
  await PL.criarIdeia(u.id, d);
  return { ok: "Ideia registrada." };
}, CAM);
export const decidirIdeiaAction = guarded(async (u, f) => {
  await PL.decidirIdeia(u.id, id.parse(f.get("id")), z.enum(["em_analise", "aprovada", "descartada"]).parse(f.get("status")));
  return { ok: "Ideia atualizada." };
}, CAM);
export const converterIdeiaAction = guarded(async (u, f) => { const p = await PL.converterIdeia(u.id, id.parse(f.get("id"))); redirect(`/producao/${p}`); }, CAM);

export const criarDataAction = guarded(async (u, f) => { await PL.criarDataEspecial(u.id, dataEspecialSchema.parse({ nome: g(f, "nome"), dia: g(f, "dia"), anual: g(f, "anual") })); return { ok: "Data cadastrada." }; }, CAM);
export const excluirDataAction = guarded(async (u, f) => { await PL.excluirDataEspecial(u.id, id.parse(f.get("id"))); return { ok: "Data removida." }; }, CAM);
