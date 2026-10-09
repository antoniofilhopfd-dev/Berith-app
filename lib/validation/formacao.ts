import { z } from "zod";
import { urlHttp } from "./liturgia";

export const CATEGORIAS = ["oracao", "formacao", "catequese", "doutrina", "leitura_biblica", "outro"] as const;
export const CATEGORIA_ROTULO: Record<(typeof CATEGORIAS)[number], string> = {
  oracao: "Orações", formacao: "Formação", catequese: "Catequese", doutrina: "Doutrina", leitura_biblica: "Leituras bíblicas", outro: "Outros",
};
const id = z.coerce.number().int().positive();
const vazio = (s: z.ZodTypeAny) => z.preprocess((v) => (v === "" || v == null ? undefined : v), s.optional());
const opt = (max: number) => z.string().trim().max(max).optional().transform((v) => v || null);

export const conteudoSchema = z.object({
  categoria: z.enum(CATEGORIAS),
  titulo: z.string().trim().min(3, "Informe o título").max(200),
  resumo: opt(500),
  corpo: z.string().max(100000).optional().transform((v) => (v?.trim() ? v.trim() : null)),
  unitId: z.preprocess((v) => (v === "" || v == null ? null : v), id.nullable()),
  fonteNome: z.string().trim().min(2, "A fonte é obrigatória (direitos autorais)").max(160),
  fonteUrl: vazio(urlHttp),
  direitos: opt(300),
  publicado: z.preprocess((v) => v !== "0" && v !== "off" && v !== false, z.boolean()).default(true),
});
export const trilhaSchema = z.object({
  titulo: z.string().trim().min(3, "Informe o título").max(160), descricao: opt(500),
  unitId: z.preprocess((v) => (v === "" || v == null ? null : v), id.nullable()),
});
export const albumSchema = z.object({
  titulo: z.string().trim().min(3, "Informe o título").max(160), descricao: opt(500),
  unitId: z.preprocess((v) => (v === "" || v == null ? null : v), id.nullable()),
  eventId: z.preprocess((v) => (v === "" || v == null ? null : v), id.nullable()),
  permitirDownload: z.preprocess((v) => v === "on" || v === "1" || v === true, z.boolean()),
});
export { id as idSchema };
