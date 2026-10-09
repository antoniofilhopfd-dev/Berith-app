import { z } from "zod";
import { isDate, isTime } from "@/lib/time";

const optId = z.preprocess((v) => (v === "" || v == null ? null : v), z.coerce.number().int().positive().nullable());
const optInt = z.preprocess((v) => (v === "" || v == null ? null : v), z.coerce.number().int().min(1).max(100000).nullable());
const optStr = (max: number) => z.string().trim().max(max).optional().transform((v) => v || null);
const data = z.string().refine(isDate, "Data inválida");
const hora = z.string().refine(isTime, "Horário inválido (use HH:MM)");

export const eventoSchema = z.object({
  titulo: z.string().trim().min(3, "Informe o título").max(160),
  descricao: optStr(4000),
  local: optStr(160),
  unitId: optId,
  data,
  horaInicio: hora,
  dataFim: z.preprocess((v) => (v === "" ? undefined : v), data.optional()),
  horaFim: z.preprocess((v) => (v === "" ? undefined : v), hora.optional()),
  limite: optInt,
  lembreteMin: optInt,
  recorrencia: z.enum(["nenhuma", "semanal", "mensal"]).default("nenhuma"),
  recorrenciaAte: z.preprocess((v) => (v === "" ? undefined : v), data.optional()),
  responsavelEmail: z.preprocess((v) => (v === "" ? undefined : v), z.string().trim().toLowerCase().email().optional()),
});
export type EventoInput = z.infer<typeof eventoSchema>;

export const rsvpSchema = z.object({
  eventId: z.coerce.number().int().positive(),
  date: data,
  status: z.enum(["confirmado", "talvez", "nao_vai"]),
});

export const comunicadoSchema = z.object({
  titulo: z.string().trim().min(3, "Informe o título").max(160),
  corpo: z.string().trim().min(3, "Escreva o comunicado").max(8000),
  unitId: optId,
  prioridade: z.enum(["normal", "importante", "urgente"]).default("normal"),
  publicarData: z.preprocess((v) => (v === "" ? undefined : v), data.optional()),
  publicarHora: z.preprocess((v) => (v === "" ? undefined : v), hora.optional()),
  expiraData: z.preprocess((v) => (v === "" ? undefined : v), data.optional()),
});
