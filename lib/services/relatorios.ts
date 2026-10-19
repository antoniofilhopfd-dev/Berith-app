import type { RowDataPacket } from "mysql2/promise";
import { query } from "@/lib/db";
import { assertCan } from "@/lib/permissions";
import { REDES, type Formato, type Rede } from "@/lib/editorial";
import { addDays, isDate, localToUtc, utcToLocal } from "@/lib/time";
import { DomainError } from "./errors";

export const METRICAS = ["alcance", "impressoes", "curtidas", "comentarios", "compartilhamentos", "salvamentos", "visualizacoes"] as const;
export type Metrica = (typeof METRICAS)[number];
export const METRICA_ROTULO: Record<Metrica, string> = {
  alcance: "Alcance", impressoes: "Impressões", curtidas: "Curtidas", comentarios: "Comentários", compartilhamentos: "Compartilhamentos", salvamentos: "Salvamentos", visualizacoes: "Visualizações",
};

/** Métricas que cada API oficial (como integrada aqui) fornece. O que não está na lista é "indisponível" para a rede. */
export const DISPONIVEIS: Record<Rede, readonly Metrica[]> = {
  instagram: ["alcance", "curtidas", "comentarios", "compartilhamentos", "salvamentos", "visualizacoes"],
  facebook: ["alcance", "curtidas", "comentarios", "compartilhamentos"],
  tiktok: ["curtidas", "comentarios", "compartilhamentos", "visualizacoes"],
  youtube: ["curtidas", "comentarios", "visualizacoes"],
};

export type Celula = { estado: "valor"; valor: number } | { estado: "indisponivel" | "nao_conectada" | "sem_dados" };
export type LinhaRede = {
  rede: Rede; publicadas: number; assistidas: number; conectada: boolean; comColeta: number;
  metricas: Record<Metrica, Celula>; anterior: Record<Metrica, Celula> | null; publicadasAnterior: number | null;
  seguidores: { inicio: number | null; fim: number | null; variacao: number | null };
};
export type LinhaPublicacao = {
  id: number; titulo: string; rede: Rede; formato: Formato; publicada_em: Date; url: string | null; assistida: boolean; coletada: boolean;
  valores: Record<Metrica, number | null>;
};
export type Relatorio = {
  de: string; ate: string; anteriorDe: string | null; anteriorAte: string | null;
  totais: { publicadas: number; automaticas: number; assistidas: number; anterior: number | null };
  redes: LinhaRede[]; formatos: { formato: Formato; publicadas: number }[]; publicacoes: LinhaPublicacao[];
};

/** Redes mostradas na tela e nas exportações de Relatórios (o ministério acompanha só o Instagram por enquanto). */
export const REDES_RELATORIO: readonly Rede[] = ["instagram"];
const marcas = (redes: readonly Rede[]) => redes.map(() => "?").join(",");

const dias = (de: string, ate: string) => Math.round((new Date(ate + "T12:00:00Z").getTime() - new Date(de + "T12:00:00Z").getTime()) / 86400000) + 1;

export function validarPeriodo(de: string, ate: string) {
  if (!isDate(de) || !isDate(ate)) throw new DomainError("Período inválido.");
  if (ate < de) throw new DomainError("A data final não pode ser anterior à inicial.");
  if (dias(de, ate) > 400) throw new DomainError("Escolha um período de até 400 dias.");
}

async function somas(de: string, ate: string, redes: readonly Rede[]): Promise<Map<Rede, { publicadas: number; assistidas: number; comColeta: number; soma: Record<Metrica, number | null> }>> {
  const ini = localToUtc(de, "00:00"), fim = localToUtc(addDays(ate, 1), "00:00");
  const rows = await query<RowDataPacket>(
    `SELECT r.rede, COUNT(*) AS publicadas, SUM(r.assistida) AS assistidas, COUNT(x.id) AS com_coleta,
       SUM(x.alcance) AS alcance, SUM(x.impressoes) AS impressoes, SUM(x.curtidas) AS curtidas, SUM(x.comentarios) AS comentarios,
       SUM(x.compartilhamentos) AS compartilhamentos, SUM(x.salvamentos) AS salvamentos, SUM(x.visualizacoes) AS visualizacoes
     FROM publicacao_redes r
     LEFT JOIN metricas_publicacao x ON x.id = (SELECT MAX(y.id) FROM metricas_publicacao y WHERE y.publicacao_rede_id = r.id AND y.coletado_em < ?)
     WHERE r.envio = 'publicada' AND r.rede IN (${marcas(redes)}) AND r.publicada_em >= ? AND r.publicada_em < ? GROUP BY r.rede`, [fim, ...redes, ini, fim]);
  const out = new Map<Rede, { publicadas: number; assistidas: number; comColeta: number; soma: Record<Metrica, number | null> }>();
  for (const r of rows) {
    out.set(r.rede as Rede, {
      publicadas: Number(r.publicadas), assistidas: Number(r.assistidas ?? 0), comColeta: Number(r.com_coleta),
      soma: Object.fromEntries(METRICAS.map((m) => [m, r[m] == null ? null : Number(r[m])])) as Record<Metrica, number | null>,
    });
  }
  return out;
}

function celulas(rede: Rede, conectada: boolean, s: { comColeta: number; soma: Record<Metrica, number | null> } | undefined): Record<Metrica, Celula> {
  return Object.fromEntries(METRICAS.map((m): [Metrica, Celula] => {
    if (!DISPONIVEIS[rede].includes(m)) return [m, { estado: "indisponivel" }];
    if (!conectada && !s?.comColeta) return [m, { estado: "nao_conectada" }];
    const v = s?.soma[m];
    return [m, v == null ? { estado: "sem_dados" } : { estado: "valor", valor: v }];
  })) as Record<Metrica, Celula>;
}

async function seguidores(rede: Rede, de: string, ate: string) {
  const r = await query<RowDataPacket>(
    `SELECT (SELECT seguidores FROM metricas_conta WHERE rede = ? AND dia >= ? AND dia <= ? AND seguidores IS NOT NULL ORDER BY dia ASC LIMIT 1) AS inicio,
            (SELECT seguidores FROM metricas_conta WHERE rede = ? AND dia >= ? AND dia <= ? AND seguidores IS NOT NULL ORDER BY dia DESC LIMIT 1) AS fim`, [rede, de, ate, rede, de, ate]);
  const inicio = r[0].inicio == null ? null : Number(r[0].inicio), fim = r[0].fim == null ? null : Number(r[0].fim);
  return { inicio, fim, variacao: inicio != null && fim != null ? fim - inicio : null };
}

export async function gerarRelatorio(actor: number, de: string, ate: string, comparar = true, redesAlvo: readonly Rede[] = REDES): Promise<Relatorio> {
  await assertCan(actor, "relatorios", "ver");
  validarPeriodo(de, ate);
  const n = dias(de, ate);
  const aAte = addDays(de, -1), aDe = addDays(de, -n);
  const [atual, ant, contas] = await Promise.all([somas(de, ate, redesAlvo), comparar ? somas(aDe, aAte, redesAlvo) : Promise.resolve(null), query<RowDataPacket>("SELECT rede FROM redes_contas WHERE status = 'conectada'")]);
  const conectadas = new Set(contas.map((c) => c.rede as Rede));
  const redes: LinhaRede[] = [];
  for (const rede of redesAlvo) {
    const a = atual.get(rede), b = ant?.get(rede);
    redes.push({
      rede, publicadas: a?.publicadas ?? 0, assistidas: a?.assistidas ?? 0, comColeta: a?.comColeta ?? 0, conectada: conectadas.has(rede),
      metricas: celulas(rede, conectadas.has(rede), a), anterior: ant ? celulas(rede, conectadas.has(rede), b) : null, publicadasAnterior: ant ? b?.publicadas ?? 0 : null,
      seguidores: await seguidores(rede, de, ate),
    });
  }
  const ini = localToUtc(de, "00:00"), fim = localToUtc(addDays(ate, 1), "00:00");
  const formatos = await query<RowDataPacket>(
    `SELECT p.formato, COUNT(*) n FROM publicacao_redes r JOIN publicacoes p ON p.id = r.publicacao_id WHERE r.envio = 'publicada' AND r.rede IN (${marcas(redesAlvo)}) AND r.publicada_em >= ? AND r.publicada_em < ? GROUP BY p.formato ORDER BY n DESC`, [...redesAlvo, ini, fim]);
  const pubs = await query<RowDataPacket>(
    `SELECT p.id, p.titulo, p.formato, r.rede, r.publicada_em, r.url_externa, r.assistida, x.id AS coleta,
       x.alcance, x.impressoes, x.curtidas, x.comentarios, x.compartilhamentos, x.salvamentos, x.visualizacoes
     FROM publicacao_redes r JOIN publicacoes p ON p.id = r.publicacao_id
     LEFT JOIN metricas_publicacao x ON x.id = (SELECT MAX(y.id) FROM metricas_publicacao y WHERE y.publicacao_rede_id = r.id AND y.coletado_em < ?)
     WHERE r.envio = 'publicada' AND r.rede IN (${marcas(redesAlvo)}) AND r.publicada_em >= ? AND r.publicada_em < ? ORDER BY r.publicada_em DESC LIMIT 500`, [fim, ...redesAlvo, ini, fim]);
  const totalAtual = redes.reduce((s, r) => s + r.publicadas, 0);
  return {
    de, ate, anteriorDe: ant ? aDe : null, anteriorAte: ant ? aAte : null,
    totais: { publicadas: totalAtual, automaticas: totalAtual - redes.reduce((s, r) => s + r.assistidas, 0), assistidas: redes.reduce((s, r) => s + r.assistidas, 0), anterior: ant ? [...ant.values()].reduce((s, v) => s + v.publicadas, 0) : null },
    redes, formatos: formatos.map((f) => ({ formato: f.formato as Formato, publicadas: Number(f.n) })),
    publicacoes: pubs.map((p) => ({
      id: p.id, titulo: p.titulo, rede: p.rede, formato: p.formato, publicada_em: p.publicada_em, url: p.url_externa, assistida: Boolean(p.assistida), coletada: p.coleta != null,
      valores: Object.fromEntries(METRICAS.map((m) => [m, p[m] == null ? null : Number(p[m])])) as Record<Metrica, number | null>,
    })),
  };
}

export const textoCelula = (c: Celula) => c.estado === "valor" ? new Intl.NumberFormat("pt-BR").format(c.valor) : c.estado === "indisponivel" ? "indisponível" : c.estado === "nao_conectada" ? "não conectada" : "sem dados";
export function variacao(a: Celula, b: Celula | null | undefined): number | null {
  if (!b || a.estado !== "valor" || b.estado !== "valor" || b.valor === 0) return null;
  return Math.round(((a.valor - b.valor) / b.valor) * 100);
}

/* ================= Conta inteira (inclui posts feitos fora do app) ================= */
export type PostConta = {
  rede: Rede; id: string; tipo: string | null; legenda: string | null; url: string | null; publicado_em: Date;
  valores: Record<Metrica, number | null>;
};
export type ResumoConta = { rede: Rede; posts: number; conectada: boolean; soma: Record<Metrica, number | null>; atualizadoEm: Date | null };
export type PostRanking = PostConta & { interacoes: number };
export type MelhorHorario = { amostra: number; minimo: number; melhor: { dia: string; mediaDia: number; hora: number; mediaHora: number; confianca: "alta" | "baixa" } | null };
export type FormatoConta = { tipo: string; posts: number; mediaInteracoes: number };
export type RelatorioConta = {
  de: string; ate: string; redes: ResumoConta[]; posts: PostConta[];
  /** Instagram: melhores posts do período por interações. */
  ranking: PostRanking[]; horarios: MelhorHorario; formatos: FormatoConta[];
};

const DIAS_SEMANA = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
export const MIN_AMOSTRA_HORARIOS = 8, MIN_POR_FAIXA = 3;
export const ROTULO_TIPO: Record<string, string> = { REELS: "Reels", VIDEO: "Vídeo", IMAGE: "Imagem", CAROUSEL_ALBUM: "Carrossel", STORY: "Stories" };

/** Interações = curtidas + comentários + compartilhamentos + salvamentos (o que a rede informar; ausente conta 0). */
export const interacoesDe = (v: Record<Metrica, number | null>) => (v.curtidas ?? 0) + (v.comentarios ?? 0) + (v.compartilhamentos ?? 0) + (v.salvamentos ?? 0);

/** Ranking, melhor dia/horário e formatos a partir dos posts reais importados (nunca uma tabela genérica de mercado). */
export function analisarPosts(posts: PostConta[], limite = 10): { ranking: PostRanking[]; horarios: MelhorHorario; formatos: FormatoConta[] } {
  const com = posts.map((p) => ({ ...p, interacoes: interacoesDe(p.valores) }));
  const ranking = [...com].sort((a, b) => b.interacoes - a.interacoes || +new Date(b.publicado_em) - +new Date(a.publicado_em)).slice(0, limite);
  const porTipo = new Map<string, number[]>();
  for (const p of com) { const t = ROTULO_TIPO[p.tipo ?? ""] ?? p.tipo ?? "Outro"; (porTipo.get(t) ?? porTipo.set(t, []).get(t)!).push(p.interacoes); }
  const formatos = [...porTipo.entries()].map(([tipo, v]) => ({ tipo, posts: v.length, mediaInteracoes: Math.round(v.reduce((a, b) => a + b, 0) / v.length) })).sort((a, b) => b.posts - a.posts);
  if (com.length < MIN_AMOSTRA_HORARIOS) return { ranking, horarios: { amostra: com.length, minimo: MIN_AMOSTRA_HORARIOS, melhor: null }, formatos };
  const dias = new Map<number, number[]>(), horas = new Map<number, number[]>();
  for (const p of com) {
    const l = utcToLocal(new Date(p.publicado_em));
    const h = Number(l.time.slice(0, 2));
    (dias.get(l.dow) ?? dias.set(l.dow, []).get(l.dow)!).push(p.interacoes);
    (horas.get(h) ?? horas.set(h, []).get(h)!).push(p.interacoes);
  }
  const topo = (m: Map<number, number[]>) => [...m.entries()].map(([k, v]) => ({ k, media: Math.round(v.reduce((a, b) => a + b, 0) / v.length), n: v.length })).sort((a, b) => b.media - a.media || b.n - a.n)[0];
  const d = topo(dias), h = topo(horas);
  return { ranking, formatos, horarios: { amostra: com.length, minimo: MIN_AMOSTRA_HORARIOS, melhor: { dia: DIAS_SEMANA[d.k], mediaDia: d.media, hora: h.k, mediaHora: h.media, confianca: d.n >= MIN_POR_FAIXA && h.n >= MIN_POR_FAIXA ? "alta" : "baixa" } } };
}

/** Todos os posts da conta no período, importados pela API oficial — independem de terem sido criados no app. */
export async function gerarRelatorioConta(actor: number, de: string, ate: string, redesAlvo: readonly Rede[] = REDES): Promise<RelatorioConta> {
  await assertCan(actor, "relatorios", "ver");
  validarPeriodo(de, ate);
  const ini = localToUtc(de, "00:00"), fim = localToUtc(addDays(ate, 1), "00:00");
  const rows = await query<RowDataPacket>(
    `SELECT rede, id_externo, tipo, legenda, url, publicado_em, alcance, curtidas, comentarios, compartilhamentos, salvamentos, visualizacoes, coletado_em
     FROM posts_externos WHERE rede IN (${marcas(redesAlvo)}) AND publicado_em >= ? AND publicado_em < ? ORDER BY publicado_em DESC LIMIT 500`, [...redesAlvo, ini, fim]);
  const contas = await query<RowDataPacket>("SELECT rede FROM redes_contas WHERE status = 'conectada'");
  const conectadas = new Set(contas.map((c) => c.rede as Rede));
  const posts: PostConta[] = rows.map((p) => ({
    rede: p.rede as Rede, id: p.id_externo, tipo: p.tipo, legenda: p.legenda, url: p.url, publicado_em: p.publicado_em,
    valores: Object.fromEntries(METRICAS.map((m) => [m, p[m] == null ? null : Number(p[m])])) as Record<Metrica, number | null>,
  }));
  const redes: ResumoConta[] = redesAlvo.map((rede) => {
    const dela = posts.filter((p) => p.rede === rede);
    const soma = Object.fromEntries(METRICAS.map((m) => {
      const vs = dela.map((p) => p.valores[m]).filter((v): v is number => v != null);
      return [m, vs.length ? vs.reduce((a, b) => a + b, 0) : null];
    })) as Record<Metrica, number | null>;
    const ultima = rows.filter((p) => p.rede === rede).reduce<Date | null>((a, p) => (!a || new Date(p.coletado_em) > a ? new Date(p.coletado_em) : a), null);
    return { rede, posts: dela.length, conectada: conectadas.has(rede), soma, atualizadoEm: ultima };
  });
  const insta = posts.filter((p) => p.rede === "instagram");
  return { de, ate, redes, posts, ...analisarPosts(insta) };
}
