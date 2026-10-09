"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { guarded } from "@/lib/auth/guard";
import { eventoSchema, rsvpSchema } from "@/lib/validation/eventos";
import { cancelEvent, cancelOccurrence, createEvent, rsvp, updateEvent } from "@/lib/services/eventos";
import { isDate } from "@/lib/time";

const P = ["/eventos", "/"];
const clean = (f: FormData) => Object.fromEntries([...f].filter(([k]) => !k.startsWith("$")));

export const criarEventoAction = guarded(async (u, f) => {
  const id = await createEvent(u.id, eventoSchema.parse(clean(f)));
  redirect(`/eventos/${id}`);
}, P);

export const editarEventoAction = guarded(async (u, f) => {
  const id = z.coerce.number().int().positive().parse(f.get("id"));
  await updateEvent(u.id, id, eventoSchema.parse(clean(f)));
  redirect(`/eventos/${id}`);
}, P);

export const cancelarEventoAction = guarded(async (u, f) => {
  const id = z.coerce.number().int().positive().parse(f.get("id"));
  await cancelEvent(u.id, id, z.string().trim().max(255).parse(String(f.get("motivo") ?? "")) || null);
  return { ok: "Evento cancelado." };
}, P);

export const cancelarOcorrenciaAction = guarded(async (u, f) => {
  const id = z.coerce.number().int().positive().parse(f.get("id"));
  const date = String(f.get("date"));
  if (!isDate(date)) throw new z.ZodError([{ code: "custom", message: "Data inválida", path: [] }]);
  await cancelOccurrence(u.id, id, date, z.string().trim().max(255).parse(String(f.get("motivo") ?? "")) || null);
  return { ok: "Esta data foi cancelada." };
}, P);

export const confirmarPresencaAction = guarded(async (u, f) => {
  const d = rsvpSchema.parse(clean(f));
  await rsvp(u.id, d.eventId, d.date, d.status);
  return { ok: d.status === "confirmado" ? "Presença confirmada." : d.status === "talvez" ? "Marcado como talvez." : "Registrado que você não vai." };
}, P);
