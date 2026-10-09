import { z } from "zod";
import { isDate, isTime } from "@/lib/time";

const id = z.coerce.number().int().positive();
const data = z.string().refine(isDate, "Data inválida");
const hora = z.string().refine(isTime, "Horário inválido (use HH:MM)");
const opt = (max: number) => z.string().trim().max(max).optional().transform((v) => v || null);
const blank = <T extends z.ZodTypeAny>(s: T) => z.preprocess((v) => (v === "" ? undefined : v), s.optional());

export const escalaSchema = z.object({
  unitId: id, titulo: z.string().trim().min(3, "Informe o título").max(160),
  data, horaInicio: hora, horaFim: hora, observacao: opt(500),
});
export const escalaveisSchema = z.object({
  shiftId: id, email: z.string().trim().toLowerCase().email("E-mail inválido"), funcao: opt(80),
  forcar: z.preprocess((v) => v === "on" || v === "1" || v === true, z.boolean()),
});
export const tarefaSchema = z.object({
  unitId: id, titulo: z.string().trim().min(3, "Informe o título").max(160), descricao: opt(4000),
  prazo: blank(data), prioridade: z.enum(["baixa", "media", "alta"]).default("media"),
  responsavelEmail: blank(z.string().trim().toLowerCase().email("E-mail do responsável inválido")),
});
export const reuniaoSchema = z.object({
  unitId: id, titulo: z.string().trim().min(3, "Informe o título").max(160), data, horaInicio: hora, horaFim: blank(hora),
  local: opt(160), pauta: opt(4000),
});
export const decisaoSchema = z.object({
  meetingId: id, texto: z.string().trim().min(3, "Descreva a decisão").max(1000),
  gerarTarefa: z.preprocess((v) => v === "on" || v === "1", z.boolean()),
  responsavelEmail: blank(z.string().trim().toLowerCase().email("E-mail do responsável inválido")), prazo: blank(data),
});
export { id as idSchema, data as dataSchema };
