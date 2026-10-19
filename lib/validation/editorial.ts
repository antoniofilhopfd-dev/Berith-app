import { z } from "zod";
import { FORMATOS, PRIORIDADES, REDES_ATIVAS, type Rede } from "@/lib/editorial";

const REDES_ENUM = REDES_ATIVAS as unknown as [Rede, ...Rede[]];
import { isDate, isTime, localToUtc } from "@/lib/time";

const vazio = <T extends z.ZodTypeAny>(s: T) => z.preprocess((v) => (v === "" || v === undefined || v === null ? null : v), s.nullable());
const texto = (max: number) => z.string().trim().max(max).optional().transform((v) => (v ? v : null));
const idOpc = vazio(z.coerce.number().int().positive());

/** Data + hora do formulário (fuso do ministério) → instante UTC; ambos vazios = sem valor. */
export function dataHora(data: string | null | undefined, hora: string | null | undefined, rotulo: string): Date | null {
  const d = (data ?? "").trim(), h = (hora ?? "").trim();
  if (!d && !h) return null;
  if (!d || !isDate(d)) throw new z.ZodError([{ code: "custom", message: `${rotulo}: data inválida.`, path: [] }]);
  const hh = h || "09:00";
  if (!isTime(hh)) throw new z.ZodError([{ code: "custom", message: `${rotulo}: horário inválido.`, path: [] }]);
  return localToUtc(d, hh);
}

export const redesSchema = z.array(z.enum(REDES_ENUM)).max(4).transform((a) => [...new Set(a)]);
const ids = z.array(z.coerce.number().int().positive()).max(10).transform((a) => [...new Set(a)]);

export const publicacaoSchema = z.object({
  titulo: z.string().trim().min(2, "Informe o título interno").max(160),
  descricao: texto(5000),
  objetivo: texto(300),
  formato: z.enum(FORMATOS),
  redes: redesSchema,
  campanhaId: idOpc,
  editoriaId: idOpc,
  responsavelId: idOpc,
  prioridade: z.enum(PRIORIDADES).default("media"),
  legenda: texto(20000),
  hashtags: texto(600),
  referencias: texto(5000),
  observacoes: texto(5000),
  midiaIds: ids,
  // Ajustes por rede (opcionais).
  redesExtra: z.partialRecord(z.enum(REDES_ENUM), z.object({ legenda: texto(20000), hashtags: texto(600), tituloExterno: texto(150), contaId: z.string().trim().regex(/^\d{1,40}$/, "Conta inválida.").optional() })).default({}),
});
export type PublicacaoInput = z.infer<typeof publicacaoSchema>;

/** Lê o formulário da produção (campos planos) e devolve o objeto validado + prazo/publicarEm em UTC. */
export function lerPublicacao(f: FormData) {
  const g = (k: string) => { const v = f.get(k); return typeof v === "string" ? v : ""; };
  const redes = f.getAll("redes").map(String);
  const redesExtra: Record<string, { legenda: string; hashtags: string; tituloExterno: string; contaId?: string }> = {};
  for (const r of REDES_ATIVAS) redesExtra[r] = { legenda: g(`legenda_${r}`), hashtags: g(`hashtags_${r}`), tituloExterno: g(`titulo_${r}`), ...(g(`conta_${r}`) ? { contaId: g(`conta_${r}`) } : {}) };
  const midiaIds = g("midiaIds").split(",").map((x) => x.trim()).filter(Boolean);
  const d = publicacaoSchema.parse({
    titulo: g("titulo"), descricao: g("descricao"), objetivo: g("objetivo"), formato: g("formato"), redes,
    campanhaId: g("campanhaId"), editoriaId: g("editoriaId"), responsavelId: g("responsavelId"), prioridade: g("prioridade") || "media",
    legenda: g("legenda"), hashtags: g("hashtags"), referencias: g("referencias"), observacoes: g("observacoes"), midiaIds, redesExtra,
  });
  return {
    dados: d,
    prazo: dataHora(g("prazoData"), g("prazoHora"), "Prazo"),
    publicarEm: dataHora(g("publicarData"), g("publicarHora"), "Publicação"),
  };
}

export const campanhaSchema = z.object({
  nome: z.string().trim().min(2, "Informe o nome").max(120),
  descricao: texto(5000), objetivo: texto(300),
  inicio: vazio(z.string().refine(isDate, "Data inicial inválida")),
  fim: vazio(z.string().refine(isDate, "Data final inválida")),
  cor: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Cor inválida").default("#b07840"),
  status: z.enum(["planejada", "ativa", "encerrada"]).default("planejada"),
  responsavelId: idOpc,
}).refine((d) => !d.inicio || !d.fim || d.fim >= d.inicio, { message: "O fim não pode ser anterior ao início.", path: ["fim"] });

export const editoriaSchema = z.object({
  nome: z.string().trim().min(2, "Informe o nome").max(80),
  descricao: texto(300),
  cor: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Cor inválida").default("#587458"),
});

export const ideiaSchema = z.object({
  titulo: z.string().trim().min(2, "Informe o título").max(160),
  descricao: texto(5000), referencias: texto(5000),
  editoriaId: idOpc, campanhaId: idOpc,
  prioridade: z.enum(PRIORIDADES).default("media"),
  redes: z.array(z.enum(REDES_ENUM)).default([]).transform((a) => [...new Set(a)]),
});

export const modeloSchema = z.object({
  nome: z.string().trim().min(2, "Informe o nome do modelo").max(120),
  formato: z.enum(FORMATOS), redes: redesSchema,
  objetivo: texto(300), legenda: texto(20000), hashtags: texto(600),
});

export const comentarioSchema = z.object({ texto: z.string().trim().min(1, "Escreva o comentário").max(3000), tipo: z.enum(["comentario", "ajuste"]).default("comentario") });
export const dataEspecialSchema = z.object({ nome: z.string().trim().min(2).max(120), dia: z.string().refine(isDate, "Data inválida"), anual: z.preprocess((v) => v === "on" || v === "1", z.boolean()) });
