"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { guarded } from "@/lib/auth/guard";
import { idSchema, tarefaSchema } from "@/lib/validation/organizacao";
import { comment, createTask, setStatus, updateTask, STATUS } from "@/lib/services/tarefas";

const P = ["/tarefas", "/"];

export const criarTarefaAction = guarded(async (u, f) => {
  const id = await createTask(u.id, tarefaSchema.parse(Object.fromEntries(f)));
  redirect(`/tarefas/${id}`);
}, P);

export const editarTarefaAction = guarded(async (u, f) => {
  const o = Object.fromEntries(f);
  const d = tarefaSchema.omit({ unitId: true }).parse(o);
  await updateTask(u.id, idSchema.parse(o.id), d);
  return { ok: "Tarefa atualizada." };
}, P);

export const statusTarefaAction = guarded(async (u, f) => {
  const d = z.object({ id: idSchema, status: z.enum(STATUS) }).parse(Object.fromEntries(f));
  await setStatus(u.id, d.id, d.status);
  return { ok: "Andamento atualizado." };
}, P);

export const comentarAction = guarded(async (u, f) => {
  const d = z.object({ id: idSchema, texto: z.string().trim().min(1, "Escreva o comentário").max(2000) }).parse(Object.fromEntries(f));
  await comment(u.id, d.id, d.texto);
  return { ok: "Comentário publicado." };
}, ["/tarefas"]);
