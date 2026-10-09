"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { guarded } from "@/lib/auth/guard";
import { decisaoSchema, idSchema, reuniaoSchema } from "@/lib/validation/organizacao";
import { addDecision, createMeeting, saveMinutes } from "@/lib/services/reunioes";

const P = ["/reunioes", "/tarefas", "/"];

export const criarReuniaoAction = guarded(async (u, f) => {
  const id = await createMeeting(u.id, reuniaoSchema.parse(Object.fromEntries(f)));
  redirect(`/reunioes/${id}`);
}, P);

export const salvarAtaAction = guarded(async (u, f) => {
  const d = z.object({ id: idSchema, ata: z.string().max(20000).default(""), status: z.enum(["agendada", "realizada", "cancelada"]) }).parse(Object.fromEntries(f));
  await saveMinutes(u.id, d.id, d.ata.trim(), d.status);
  return { ok: "Ata salva." };
}, P);

export const decisaoAction = guarded(async (u, f) => {
  const taskId = await addDecision(u.id, decisaoSchema.parse(Object.fromEntries(f)));
  return { ok: taskId ? "Decisão registrada e tarefa criada." : "Decisão registrada." };
}, P);
