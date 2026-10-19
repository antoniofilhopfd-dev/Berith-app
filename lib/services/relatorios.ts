import type { RowDataPacket } from "mysql2/promise";
import { query } from "@/lib/db";
import { assertCan } from "@/lib/permissions";
import { contasInstagram, type ContaInstagram } from "@/lib/integracoes/contas";
import { utcToLocal } from "@/lib/time";
import { DomainError } from "./errors";

/**
 * Relatório mensal do Instagram (dados oficiais da Meta). Compara o mês escolhido com o anterior.
 * Totais da conta vêm de `instagram_mensal`; posts de `posts_externos`; seguidores de `metricas_conta`.
 * O que a Meta não informar fica nulo (nunca estimado).
 */
export const CAMPOS = ["alcance", "visualizacoes", "visitasPerfil", "interacoes", "curtidas", "comentarios", "compartilhamentos", "salvamentos"] as const;
export type Campo = (typeof CAMPOS)[number];
export type TotaisMes = Record<Campo, number | null>;
export const CAMPO_ROTULO: Record<Campo, string> = {
  alcance: "Alcance", visualizacoes: "Visualizações", visitasPerfil: "Visitas ao perfil", interacoes: "Interações",
  curtidas: "Curtidas", comentarios: "Comentários", compartilhamentos: "Compartilhamentos", salvamentos: "Salvamentos",
};
const COLUNA: Record<Campo, string> = {
  alcance: "alcance", visualizacoes: "visualizacoes", visitasPerfil: "visitas_perfil", interacoes: "interacoes",
  curtidas: "curtidas", comentarios: "comentarios", compartilhamentos: "compartilhamentos", salvamentos: "salvamentos",
};
export const ROTULO_TIPO: Record<string, string> = { REELS: "Reels", VIDEO: "Vídeo", IMAGE: "Feed", CAROUSEL_ALBUM: "Carrossel", STORY: "Stories" };
export const MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
const DIAS_SEMANA = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
export const MIN_AMOSTRA_HORARIOS = 8, MIN_POR_FAIXA = 3;

export type PostMes = {
  id: string; tipo: string | null; legenda: string | null; url: string | null; miniatura: string | null; publicado_em: Date;
  alcance: number | null; curtidas: number | null; comentarios: number | null; salvamentos: number | null; compartilhamentos: number | null; visualizacoes: number | null;
  interacoes: number;
};
export type MelhorHorario = { amostra: number; minimo: number; melhor: { dia: string; mediaDia: number; hora: number; mediaHora: number; confianca: "alta" | "baixa" } | null };
export type RelatorioMensal = {
  mes: string; anterior: string; rotuloMes: string; conta: string | null; contaId: string | null; contas: ContaInstagram[];
  atual: TotaisMes | null; anteriorTotais: TotaisMes | null;
  seguidores: number | null; seguidoresAnterior: number | null;
  posts: PostMes[]; reels: number; feed: number; formatos: { tipo: string; posts: number; mediaInteracoes: number }[];
  horarios: MelhorHorario; atualizadoEm: Date | null;
};

export const mesValido = (m: string) => /^\d{4}-(0[1-9]|1[0-2])$/.test(m);
export function validarMes(m: string) { if (!mesValido(m)) throw new DomainError("Mês inválido. Use o formato AAAA-MM."); }
export const mesAtual = (agora = new Date()) => utcToLocal(agora).date.slice(0, 7);
export function mesAnterior(m: string) { const [a, n] = m.split("-").map(Number); return n === 1 ? `${a - 1}-12` : `${a}-${String(n - 1).padStart(2, "0")}`; }
export const rotuloMes = (m: string) => `${MESES[Number(m.slice(5, 7)) - 1]} de ${m.slice(0, 4)}`;

/** Interações = curtidas + comentários + compartilhamentos + salvamentos (o que a rede informar; ausente conta 0). */
export const interacoesDe = (p: { curtidas: number | null; comentarios: number | null; compartilhamentos: number | null; salvamentos: number | null }) =>
  (p.curtidas ?? 0) + (p.comentarios ?? 0) + (p.compartilhamentos ?? 0) + (p.salvamentos ?? 0);

/** Variação percentual do mês atual sobre o anterior (null quando não dá para comparar). */
export function variacaoPct(atual: number | null | undefined, anterior: number | null | undefined): number | null {
  if (atual == null || anterior == null || anterior === 0) return null;
  return Math.round(((atual - anterior) / anterior) * 1000) / 10;
}

export const num = (v: unknown) => (v == null ? null : Number(v));

/** Linha de posts_externos → post com interações calculadas. */
export function postDeLinha(p: RowDataPacket): PostMes {
  const base = { curtidas: num(p.curtidas), comentarios: num(p.comentarios), salvamentos: num(p.salvamentos), compartilhamentos: num(p.compartilhamentos) };
  return { id: p.id_externo, tipo: p.tipo, legenda: p.legenda, url: p.url, miniatura: p.miniatura, publicado_em: p.publicado_em, alcance: num(p.alcance), visualizacoes: num(p.visualizacoes), ...base, interacoes: interacoesDe(base) };
}

/** Melhor dia da semana e horário (fuso do ministério) pelas interações dos posts reais; só indica com amostra mínima. */
export function melhoresHorarios(posts: { publicado_em: Date; interacoes: number }[]): MelhorHorario {
  if (posts.length < MIN_AMOSTRA_HORARIOS) return { amostra: posts.length, minimo: MIN_AMOSTRA_HORARIOS, melhor: null };
  const dias = new Map<number, number[]>(), horas = new Map<number, number[]>();
  for (const p of posts) {
    const l = utcToLocal(new Date(p.publicado_em));
    const h = Number(l.time.slice(0, 2));
    (dias.get(l.dow) ?? dias.set(l.dow, []).get(l.dow)!).push(p.interacoes);
    (horas.get(h) ?? horas.set(h, []).get(h)!).push(p.interacoes);
  }
  const topo = (m: Map<number, number[]>) => [...m.entries()].map(([k, v]) => ({ k, media: Math.round(v.reduce((a, b) => a + b, 0) / v.length), n: v.length })).sort((a, b) => b.media - a.media || b.n - a.n)[0];
  const d = topo(dias), h = topo(horas);
  return { amostra: posts.length, minimo: MIN_AMOSTRA_HORARIOS, melhor: { dia: DIAS_SEMANA[d.k], mediaDia: d.media, hora: h.k, mediaHora: h.media, confianca: d.n >= MIN_POR_FAIXA && h.n >= MIN_POR_FAIXA ? "alta" : "baixa" } };
}

async function totais(contaId: string, periodo: string): Promise<{ totais: TotaisMes; atualizadoEm: Date } | null> {
  const r = (await query<RowDataPacket>(`SELECT ${CAMPOS.map((c) => COLUNA[c]).join(", ")}, atualizado_em FROM instagram_mensal WHERE conta_id = ? AND periodo = ?`, [contaId, periodo]))[0];
  if (!r) return null;
  return { totais: Object.fromEntries(CAMPOS.map((c) => [c, num(r[COLUNA[c]])])) as TotaisMes, atualizadoEm: r.atualizado_em as Date };
}

async function seguidoresDoMes(contaId: string, periodo: string): Promise<number | null> {
  const r = (await query<RowDataPacket>("SELECT seguidores FROM metricas_conta WHERE rede = 'instagram' AND conta_id = ? AND seguidores IS NOT NULL AND dia LIKE ? ORDER BY dia DESC LIMIT 1", [contaId, periodo + "-%"]))[0];
  return r ? Number(r.seguidores) : null;
}

export async function gerarRelatorioMensal(actor: number, mes: string, contaPedida?: string): Promise<RelatorioMensal> {
  await assertCan(actor, "relatorios", "ver");
  validarMes(mes);
  const anterior = mesAnterior(mes);
  const contas = await contasInstagram();
  const escolhida = contas.find((c) => c.igId === contaPedida) ?? contas.find((c) => c.principal) ?? contas[0] ?? null;
  const contaId = escolhida?.igId ?? "";
  const [atual, ant, segAtual, segAnt] = await Promise.all([totais(contaId, mes), totais(contaId, anterior), seguidoresDoMes(contaId, mes), seguidoresDoMes(contaId, anterior)]);
  // Posts do mês no fuso do ministério: pega uma folga de 1 dia em UTC e filtra pela data local.
  const todos = await query<RowDataPacket>(
    "SELECT id_externo, tipo, legenda, url, miniatura, publicado_em, alcance, curtidas, comentarios, salvamentos, compartilhamentos, visualizacoes, coletado_em FROM posts_externos WHERE rede = 'instagram' AND conta_id = ? ORDER BY publicado_em DESC LIMIT 1000", [contaId]);
  const todosMapeados = todos.map(postDeLinha);
  const doMes = todosMapeados.filter((p) => utcToLocal(new Date(p.publicado_em)).date.startsWith(mes)).sort((a, b) => b.interacoes - a.interacoes || +new Date(b.publicado_em) - +new Date(a.publicado_em));
  const porTipo = new Map<string, number[]>();
  for (const p of doMes) { const t = ROTULO_TIPO[p.tipo ?? ""] ?? p.tipo ?? "Outro"; (porTipo.get(t) ?? porTipo.set(t, []).get(t)!).push(p.interacoes); }
  const reels = doMes.filter((p) => p.tipo === "REELS").length;
  const coletas = todos.map((p) => new Date(p.coletado_em as Date).getTime());
  const ultimos = [atual?.atualizadoEm, ant?.atualizadoEm].filter(Boolean).map((d) => new Date(d as Date).getTime()).concat(coletas);
  return {
    mes, anterior, rotuloMes: rotuloMes(mes), conta: escolhida?.usuario ?? null, contaId: escolhida?.igId ?? null, contas,
    atual: atual?.totais ?? null, anteriorTotais: ant?.totais ?? null, seguidores: segAtual, seguidoresAnterior: segAnt,
    posts: doMes, reels, feed: doMes.length - reels,
    formatos: [...porTipo.entries()].map(([tipo, v]) => ({ tipo, posts: v.length, mediaInteracoes: Math.round(v.reduce((a, b) => a + b, 0) / v.length) })).sort((a, b) => b.posts - a.posts),
    horarios: melhoresHorarios(todosMapeados), atualizadoEm: ultimos.length ? new Date(Math.max(...ultimos)) : null,
  };
}
