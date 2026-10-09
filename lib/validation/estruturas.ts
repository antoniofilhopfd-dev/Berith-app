import { z } from "zod";
import { emailSchema } from "./auth";

export const TIPOS = ["comunidade", "caminho", "ministerio", "grupo", "equipe", "servico"] as const;
const id = z.coerce.number().int().positive();

export const unidadeSchema = z.object({
  tipo: z.enum(TIPOS),
  nome: z.string().trim().min(2, "Informe o nome").max(150),
  descricao: z.string().trim().max(2000).optional().transform((v) => v || null),
  parentId: z.preprocess((v) => (v === "" || v == null ? null : v), id.nullable()),
});
export const conviteSchema = z.object({
  nome: z.string().trim().min(2, "Informe o nome").max(150),
  email: emailSchema,
  unitId: z.preprocess((v) => (v === "" || v == null ? null : v), id.nullable()),
  funcao: z.string().trim().max(80).optional().transform((v) => v || null),
});
export const vinculoSchema = z.object({ unitId: id, userId: id, funcao: z.string().trim().max(80).optional().transform((v) => v || null) });
export const idSchema = id;
