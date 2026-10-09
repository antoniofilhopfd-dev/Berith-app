"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { guarded } from "@/lib/auth/guard";
import { escalaSchema, escalaveisSchema, dataSchema, idSchema } from "@/lib/validation/organizacao";
import { assign, cancelShift, clearUnavailable, createShift, respond, setUnavailable, substitute, unassign } from "@/lib/services/escalas";

const P = ["/escalas", "/"];
const obj = (f: FormData) => Object.fromEntries(f);

export const criarEscalaAction = guarded(async (u, f) => {
  const d = escalaSchema.parse(obj(f));
  const id = await createShift(u.id, d);
  redirect(`/escalas/${id}`);
}, P);

export const escalarAction = guarded(async (u, f) => {
  const d = escalaveisSchema.parse(obj(f));
  await assign(u.id, d.shiftId, d.email, d.funcao, d.forcar);
  return { ok: "Pessoa escalada. Ela precisa confirmar." };
}, P);

export const substituirAction = guarded(async (u, f) => {
  const d = z.object({ assignmentId: idSchema, email: z.string().trim().toLowerCase().email("E-mail inválido"), forcar: z.preprocess((v) => v === "on", z.boolean()) }).parse(obj(f));
  await substitute(u.id, d.assignmentId, d.email, d.forcar);
  return { ok: "Substituição registrada." };
}, P);

export const removerEscalacaoAction = guarded(async (u, f) => {
  await unassign(u.id, idSchema.parse(f.get("assignmentId")));
  return { ok: "Pessoa removida da escala." };
}, P);

export const cancelarEscalaAction = guarded(async (u, f) => {
  await cancelShift(u.id, idSchema.parse(f.get("id")));
  return { ok: "Escala cancelada." };
}, P);

export const responderEscalaAction = guarded(async (u, f) => {
  const d = z.object({ assignmentId: idSchema, status: z.enum(["confirmado", "recusado"]), motivo: z.string().trim().max(255).optional() }).parse(obj(f));
  await respond(u.id, d.assignmentId, d.status, d.motivo || null);
  return { ok: d.status === "confirmado" ? "Presença na escala confirmada." : "Recusa registrada; a coordenação foi avisada." };
}, P);

export const indisponivelAction = guarded(async (u, f) => {
  const d = z.object({ data: dataSchema, nota: z.string().trim().max(160).optional() }).parse(obj(f));
  await setUnavailable(u.id, d.data, d.nota || null);
  return { ok: "Indisponibilidade registrada." };
}, ["/escalas"]);

export const disponivelAction = guarded(async (u, f) => {
  await clearUnavailable(u.id, dataSchema.parse(f.get("data")));
  return { ok: "Indisponibilidade removida." };
}, ["/escalas"]);
