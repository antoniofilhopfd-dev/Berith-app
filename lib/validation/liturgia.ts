import { z } from "zod";
import { isDate } from "@/lib/time";

export const TIPOS_LITURGIA = [
  "primeira_leitura", "salmo", "segunda_leitura", "evangelho", "santo",
  "invitatorio", "oficio_leituras", "laudes", "hora_media", "vesperas", "completas",
] as const;
export type TipoLiturgia = (typeof TIPOS_LITURGIA)[number];

export const TIPO_ROTULO: Record<TipoLiturgia, string> = {
  primeira_leitura: "Primeira leitura", salmo: "Salmo responsorial", segunda_leitura: "Segunda leitura", evangelho: "Evangelho",
  santo: "Santo do dia", invitatorio: "Invitatório", oficio_leituras: "Ofício das Leituras", laudes: "Laudes (Oração da manhã)",
  hora_media: "Hora Média", vesperas: "Vésperas (Oração da tarde)", completas: "Completas (Oração da noite)",
};
export const GRUPO_PALAVRA: TipoLiturgia[] = ["primeira_leitura", "salmo", "segunda_leitura", "evangelho"];
export const GRUPO_HORAS: TipoLiturgia[] = ["invitatorio", "oficio_leituras", "laudes", "hora_media", "vesperas", "completas"];

/** Somente http(s): impede javascript:, data: e similares em links exibidos. */
export const urlHttp = z.string().trim().max(500).refine((u) => {
  try { const p = new URL(u); return p.protocol === "https:" || p.protocol === "http:"; } catch { return false; }
}, "Informe um link http(s) válido");

const vazio = (s: z.ZodTypeAny) => z.preprocess((v) => (v === "" || v == null ? undefined : v), s.optional());

export const itemLiturgiaSchema = z.object({
  data: z.string().refine(isDate, "Data inválida"),
  tipo: z.enum(TIPOS_LITURGIA),
  titulo: z.string().trim().min(2, "Informe o título ou a referência").max(200),
  texto: z.string().max(60000).optional().transform((v) => (v?.trim() ? v.trim() : null)),
  fonteNome: z.string().trim().min(2, "A fonte é obrigatória (direitos autorais)").max(160),
  fonteUrl: vazio(urlHttp),
  direitos: z.string().trim().max(300).optional().transform((v) => v || null),
});
export const fonteSchema = z.object({ titulo: z.string().trim().min(2, "Informe o nome").max(120), url: urlHttp });
