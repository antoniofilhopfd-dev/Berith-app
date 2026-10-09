"use server";

import { z } from "zod";
import { guarded } from "@/lib/auth/guard";
import { dataSchema, idSchema } from "@/lib/validation/organizacao";
import { addByEmail, mark } from "@/lib/services/presencas";

const base = z.object({ eventId: idSchema, date: dataSchema });

export const marcarPresencaAction = guarded(async (u, f) => {
  const d = base.extend({ userId: idSchema, presente: z.enum(["1", "0"]), motivo: z.string().trim().max(255).optional() }).parse(Object.fromEntries(f));
  await mark(u.id, d.eventId, d.date, d.userId, d.presente === "1", d.motivo || null);
  return { ok: d.presente === "1" ? "Presença registrada." : "Ausência registrada." };
}, ["/eventos"]);

export const adicionarParticipanteAction = guarded(async (u, f) => {
  const d = base.extend({ email: z.string().trim().toLowerCase().email("E-mail inválido") }).parse(Object.fromEntries(f));
  await addByEmail(u.id, d.eventId, d.date, d.email);
  return { ok: "Participante adicionado à chamada." };
}, ["/eventos"]);
