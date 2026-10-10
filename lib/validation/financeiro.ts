import { z } from "zod";
import { isDate } from "@/lib/time";
import { parseBRL } from "@/lib/dinheiro";

const id = z.coerce.number().int().positive();
const opt = (max: number) => z.string().trim().max(max).optional().transform((v) => v || null);
const vazio = (s: z.ZodTypeAny) => z.preprocess((v) => (v === "" || v == null ? undefined : v), s.optional());

export const valorSchema = z.string().transform((v, ctx) => {
  const c = parseBRL(v);
  if (c == null) { ctx.addIssue({ code: "custom", message: "Valor inválido. Use o formato 1.234,56 (maior que zero)." }); return z.NEVER; }
  return c;
});

export const lancamentoSchema = z.object({
  contaId: id, categoriaId: id, tipo: z.enum(["entrada", "saida"]), valor: valorSchema,
  data: z.string().refine(isDate, "Data inválida"), descricao: z.string().trim().min(3, "Descreva o lançamento").max(255),
  doadorEmail: vazio(z.string().trim().toLowerCase().email("E-mail do doador inválido")), doadorNome: opt(150),
});
export const periodoSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Período inválido (AAAA-MM)");
export const motivoSchema = z.string().trim().min(3, "Informe o motivo").max(255);
export { id as idSchema };
