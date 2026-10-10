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

/* ---------- Importação automática ---------- */
const caminho = z.string().trim().min(1).max(120).regex(/^[A-Za-z0-9_\-.]+$/, "Caminho inválido (use letras, números, ponto, hífen e sublinhado)");
const campoSchema = z.object({ titulo: caminho, texto: caminho.optional() }).strict();

export const mapeamentoSchema = z.string().transform((s, ctx) => {
  let j: unknown;
  try { j = JSON.parse(s); } catch { ctx.addIssue({ code: "custom", message: "O mapeamento precisa ser um JSON válido." }); return z.NEVER; }
  const r = z.record(z.string(), campoSchema).safeParse(j);
  if (!r.success) { ctx.addIssue({ code: "custom", message: `Mapeamento inválido: ${r.error.issues[0]?.message ?? "formato"}` }); return z.NEVER; }
  const chaves = Object.keys(r.data);
  if (chaves.length === 0) { ctx.addIssue({ code: "custom", message: "Mapeie ao menos um tipo de conteúdo." }); return z.NEVER; }
  const invalida = chaves.find((k) => !(TIPOS_LITURGIA as readonly string[]).includes(k));
  if (invalida) { ctx.addIssue({ code: "custom", message: `Tipo desconhecido no mapeamento: ${invalida}` }); return z.NEVER; }
  return r.data;
});

export const provedorSchema = z.object({
  fonteNome: z.string().trim().min(2, "Informe o nome da fonte").max(160),
  fonteUrlPublica: vazio(urlHttp),
  urlTemplate: z.string().trim().min(10).max(600).refine((u) => {
    try { const p = new URL(u.replace(/\{(data|aaaa|ano|mm|mes|dd|dia)\}/g, "2026")); return p.protocol === "https:" || p.protocol === "http:"; } catch { return false; }
  }, "Endereço inválido. Use https://… e, se precisar da data, {data}, {dd}, {mm} ou {aaaa}"),
  mapeamento: mapeamentoSchema,
  copiarTexto: z.preprocess((v) => v === "on" || v === "1" || v === true, z.boolean()),
  direitosConfirmados: z.preprocess((v) => v === "on" || v === "1" || v === true, z.boolean()),
  diasAFrente: z.coerce.number().int().min(0).max(7).default(2),
  ativo: z.preprocess((v) => v === "on" || v === "1" || v === true, z.boolean()),
}).refine((d) => !d.copiarTexto || d.direitosConfirmados, { message: "Para copiar o texto completo, confirme que a comunidade tem autorização de uso.", path: ["direitosConfirmados"] });
export type ProvedorInput = z.infer<typeof provedorSchema>;
