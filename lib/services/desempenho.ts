import type { RowDataPacket } from "mysql2/promise";
import { execute, query } from "@/lib/db";
import { assertCan } from "@/lib/permissions";
import { contasInstagram, type ContaInstagram } from "@/lib/integracoes/contas";
import { addDays, utcToLocal } from "@/lib/time";
import { DomainError } from "./errors";
import { CAMPOS, MESES, type MelhorHorario, ROTULO_TIPO, melhoresHorarios, num, postDeLinha, variacaoPct, type PostMes, type TotaisMes } from "./relatorios";

/**
 * Painel de desempenho do Instagram (7/30/90 dias, ano, tudo), com comparação com o período anterior.
 * Totais da conta vêm da Meta (janelas guardadas em instagram_janelas e meses em instagram_mensal); posts de posts_externos.
 * O que a Meta não informa fica nulo — nada é estimado.
 */
export const JANELAS = ["7", "30", "90", "ano", "todo"] as const;
export type Janela = (typeof JANELAS)[number];
export const JANELA_ROTULO: Record<Janela, string> = { "7": "7 dias", "30": "30 dias", "90": "90 dias", ano: "Ano", todo: "Todo" };
export const janelaValida = (j: string | undefined): j is Janela => !!j && (JANELAS as readonly string[]).includes(j);

const COL: Record<(typeof CAMPOS)[number], string> = { alcance: "alcance", visualizacoes: "visualizacoes", visitasPerfil: "visitas_perfil", interacoes: "interacoes", curtidas: "curtidas", comentarios: "comentarios", compartilhamentos: "compartilhamentos", salvamentos: "salvamentos" };
const SELECT_TOTAIS = CAMPOS.map((c) => COL[c]).join(", ");
const linhaTotais = (r: RowDataPacket): TotaisMes => Object.fromEntries(CAMPOS.map((c) => [c, num(r[COL[c]])])) as TotaisMes;

function somar(linhas: TotaisMes[]): TotaisMes | null {
  if (!linhas.length) return null;
  return Object.fromEntries(CAMPOS.map((c) => {
    const vs = linhas.map((l) => l[c]).filter((v): v is number => v != null);
    return [c, vs.length ? vs.reduce((a, b) => a + b, 0) : null];
  })) as TotaisMes;
}

export type PontoSeguidores = { dia: string; seguidores: number };
export type LinhaHistorico = { periodo: string; seguidores: number | null; alcance: number | null; visualizacoes: number | null; visitasPerfil: number | null; interacoes: number | null };
export type Destaque = { periodo: string; posts: { legenda: string | null; url: string | null; interacoes: number }[] };
export type FormatoDesempenho = { tipo: string; posts: number; pct: number; mediaInteracoes: number };
export type ComparativoConta = { igId: string; usuario: string; seguidores: number | null; alcance: number | null; interacoes: number | null; posts: number };

export type Desempenho = {
  janela: Janela; rotulo: string; ano: string; anos: string[]; de: string; ate: string; conta: string | null; contaId: string | null; contas: ContaInstagram[];
  atual: TotaisMes | null; anterior: TotaisMes | null; fonte: "meta" | "meses";
  engajamento: { atual: number | null; anterior: number | null };
  seguidores: { fim: number | null; noPeriodo: number | null };
  postsNoPeriodo: number; reels: number; mix: FormatoDesempenho[];
  evolucaoSeguidores: { periodo: string; seguidores: number }[]; serieSeguidores: PontoSeguidores[];
  destaques: Destaque[]; historico: LinhaHistorico[]; horarios: MelhorHorario & { totalPosts: number };
  ranking: PostMes[]; comparativo: ComparativoConta[] | null; atualizadoEm: Date | null;
};

const engajamento = (t: TotaisMes | null) => (t && t.interacoes != null && t.alcance ? Math.round((t.interacoes / t.alcance) * 1000) / 10 : null);
const rotuloPeriodo = (p: string) => `${MESES[Number(p.slice(5, 7)) - 1]} de ${p.slice(0, 4)}`;

/** Anos com algum dado (meses, posts ou seguidores) até o ano corrente, do mais antigo ao atual — alimenta o filtro de ano. */
async function anosDisponiveis(contaId: string, hoje: string): Promise<string[]> {
  const r = await query<RowDataPacket>(
    `SELECT MIN(a) primeiro FROM (SELECT MIN(SUBSTR(periodo, 1, 4)) a FROM instagram_mensal WHERE conta_id = ?
       UNION ALL SELECT MIN(SUBSTR(publicado_em, 1, 4)) FROM posts_externos WHERE rede = 'instagram' AND conta_id = ?
       UNION ALL SELECT MIN(SUBSTR(dia, 1, 4)) FROM metricas_conta WHERE rede = 'instagram' AND conta_id = ?) t`, [contaId, contaId, contaId]);
  const atual = Number(hoje.slice(0, 4)), primeiro = Math.min(atual, Number(r[0]?.primeiro) || atual);
  return Array.from({ length: atual - primeiro + 1 }, (_, i) => String(primeiro + i));
}

async function snapshots(contaId: string): Promise<PontoSeguidores[]> {
  const r = await query<RowDataPacket>("SELECT dia, seguidores FROM metricas_conta WHERE rede = 'instagram' AND conta_id = ? AND seguidores IS NOT NULL ORDER BY dia ASC", [contaId]);
  return r.map((x) => ({ dia: typeof x.dia === "string" ? x.dia : new Date(x.dia as Date).toISOString().slice(0, 10), seguidores: Number(x.seguidores) }));
}

export async function gerarDesempenho(actor: number, janelaPedida: string | undefined, contaPedida?: string, agora = new Date(), anoPedido?: string): Promise<Desempenho> {
  await assertCan(actor, "relatorios", "ver");
  if (janelaPedida && !janelaValida(janelaPedida)) throw new DomainError("Período inválido.");
  const janela: Janela = janelaValida(janelaPedida) ? janelaPedida : "30";
  const contas = await contasInstagram();
  const escolhida = contas.find((c) => c.igId === contaPedida) ?? contas.find((c) => c.principal) ?? contas[0] ?? null;
  const contaId = escolhida?.igId ?? "";
  const hoje = utcToLocal(agora).date;
  const anos = await anosDisponiveis(contaId, hoje);
  const ano = anoPedido && /^\d{4}$/.test(anoPedido) ? anoPedido : hoje.slice(0, 4);
  const fimJanela = janela === "ano" ? (`${ano}-12-31` < hoje ? `${ano}-12-31` : hoje) : hoje; // ano passado = ano inteiro; ano corrente = até hoje

  // Intervalo do período e totais (Meta) do período e do anterior
  let de = hoje, atual: TotaisMes | null = null, anterior: TotaisMes | null = null, fonte: "meta" | "meses" = "meta";
  let atualizadoEm: Date | null = null;
  const marca = (d: unknown) => { if (d) { const t = new Date(d as Date); if (!atualizadoEm || t > atualizadoEm) atualizadoEm = t; } };
  if (janela === "7" || janela === "30" || janela === "90") {
    const dias = Number(janela);
    de = addDays(hoje, -(dias - 1));
    const linhas = await query<RowDataPacket>(`SELECT quando, ${SELECT_TOTAIS}, atualizado_em FROM instagram_janelas WHERE conta_id = ? AND janela = ?`, [contaId, janela]);
    for (const l of linhas) { marca(l.atualizado_em); if (l.quando === "atual") atual = linhaTotais(l); else anterior = linhaTotais(l); }
  } else {
    fonte = "meses";
    const meses = await query<RowDataPacket>(`SELECT periodo, ${SELECT_TOTAIS}, atualizado_em FROM instagram_mensal WHERE conta_id = ? ORDER BY periodo ASC`, [contaId]);
    meses.forEach((m) => marca(m.atualizado_em));
    if (janela === "ano") {
      de = `${ano}-01-01`;
      atual = somar(meses.filter((m) => String(m.periodo).startsWith(ano)).map(linhaTotais));
      anterior = somar(meses.filter((m) => String(m.periodo).startsWith(String(Number(ano) - 1))).map(linhaTotais));
    } else {
      de = meses.length ? `${meses[0].periodo}-01` : hoje;
      atual = somar(meses.map(linhaTotais));
    }
  }

  // Posts do período (data local), formatos, ranking e horários
  const linhasPosts = await query<RowDataPacket>(
    "SELECT id_externo, tipo, legenda, url, miniatura, publicado_em, alcance, curtidas, comentarios, salvamentos, compartilhamentos, visualizacoes, coletado_em FROM posts_externos WHERE rede = 'instagram' AND conta_id = ? ORDER BY publicado_em DESC LIMIT 1000", [contaId]);
  linhasPosts.forEach((p) => marca(p.coletado_em));
  const todos = linhasPosts.map(postDeLinha);
  const dataLocal = (p: PostMes) => utcToLocal(new Date(p.publicado_em)).date;
  const doPeriodo = todos.filter((p) => { const d = dataLocal(p); return d >= de && d <= fimJanela; });
  const rotuloFormato = (p: PostMes) => (p.tipo === "REELS" ? "Reels" : p.tipo === "CAROUSEL_ALBUM" ? "Carrossel" : "Feed (imagem/vídeo)");
  const porFormato = new Map<string, number[]>();
  for (const p of doPeriodo) { const t = rotuloFormato(p); (porFormato.get(t) ?? porFormato.set(t, []).get(t)!).push(p.interacoes); }
  const mix: FormatoDesempenho[] = [...porFormato.entries()].map(([tipo, v]) => ({ tipo, posts: v.length, pct: Math.round((v.length / doPeriodo.length) * 100), mediaInteracoes: Math.round(v.reduce((a, b) => a + b, 0) / v.length) })).sort((a, b) => b.posts - a.posts);
  const ranking = [...doPeriodo].sort((a, b) => b.interacoes - a.interacoes || +new Date(b.publicado_em) - +new Date(a.publicado_em)).slice(0, 5);
  const h = melhoresHorarios(todos);

  // Seguidores
  const snaps = await snapshots(contaId);
  const ate = snaps.filter((s) => s.dia <= fimJanela);
  const fim = ate.length ? ate[ate.length - 1].seguidores : null;
  const antes = [...snaps].reverse().find((s) => s.dia < de);
  const base = antes ?? snaps.find((s) => s.dia >= de);
  const noPeriodo = fim != null && base && snaps.length > 1 ? fim - base.seguidores : null;
  const porMes = new Map<string, number>();
  for (const s of snaps) porMes.set(s.dia.slice(0, 7), s.seguidores); // último do mês (ordem crescente)
  const evolucao = [...porMes.entries()].map(([periodo, seguidores]) => ({ periodo, seguidores }));

  // Histórico mensal e destaques por mês
  const mensal = await query<RowDataPacket>(`SELECT periodo, ${SELECT_TOTAIS} FROM instagram_mensal WHERE conta_id = ? ORDER BY periodo DESC LIMIT 24`, [contaId]);
  const historico: LinhaHistorico[] = mensal.map((m) => ({ periodo: m.periodo, seguidores: porMes.get(m.periodo) ?? null, alcance: num(m.alcance), visualizacoes: num(m.visualizacoes), visitasPerfil: num(m.visitas_perfil), interacoes: num(m.interacoes) }));
  const postsPorMes = new Map<string, PostMes[]>();
  for (const p of todos) { const k = dataLocal(p).slice(0, 7); (postsPorMes.get(k) ?? postsPorMes.set(k, []).get(k)!).push(p); }
  const destaques: Destaque[] = [...postsPorMes.keys()].sort().reverse().slice(0, 2).map((k) => ({
    periodo: rotuloPeriodo(k),
    posts: [...postsPorMes.get(k)!].sort((a, b) => b.interacoes - a.interacoes).slice(0, 3).map((p) => ({ legenda: p.legenda, url: p.url, interacoes: p.interacoes })),
  }));

  // Comparativo entre contas (só quando há mais de uma): últimos 30 dias
  let comparativo: ComparativoConta[] | null = null;
  if (contas.length > 1) {
    comparativo = [];
    for (const c of contas) {
      const j = (await query<RowDataPacket>(`SELECT ${SELECT_TOTAIS} FROM instagram_janelas WHERE conta_id = ? AND janela = '30' AND quando = 'atual'`, [c.igId]))[0];
      const s = (await snapshots(c.igId)).at(-1);
      const n = (await query<RowDataPacket>("SELECT COUNT(*) n FROM posts_externos WHERE rede = 'instagram' AND conta_id = ? AND publicado_em >= DATE_SUB(?, INTERVAL 30 DAY)", [c.igId, agora]))[0];
      comparativo.push({ igId: c.igId, usuario: c.usuario, seguidores: s?.seguidores ?? null, alcance: j ? num(j.alcance) : null, interacoes: j ? num(j.interacoes) : null, posts: Number(n.n) });
    }
  }

  return {
    janela, rotulo: janela === "ano" ? ano : JANELA_ROTULO[janela], ano, anos, de, ate: fimJanela, conta: escolhida?.usuario ?? null, contaId: escolhida?.igId ?? null, contas,
    atual, anterior, fonte, engajamento: { atual: engajamento(atual), anterior: engajamento(anterior) },
    seguidores: { fim, noPeriodo }, postsNoPeriodo: doPeriodo.length, reels: doPeriodo.filter((p) => p.tipo === "REELS").length, mix,
    evolucaoSeguidores: evolucao, serieSeguidores: snaps.slice(-60), destaques, historico, horarios: { ...h, totalPosts: todos.length },
    ranking, comparativo, atualizadoEm,
  };
}

export { variacaoPct, ROTULO_TIPO };

/* ================= Publicações (cartões) e Ranking/seguidores ================= */
export const engajamentoPost = (p: { interacoes: number; alcance: number | null }) => (p.alcance ? Math.round((p.interacoes / p.alcance) * 1000) / 10 : null);
export type PostCartao = PostMes & { engajamento: number | null; formato: "Feed" | "Reels" | "Carrossel" };
const formatoDe = (p: PostMes): PostCartao["formato"] => (p.tipo === "REELS" ? "Reels" : p.tipo === "CAROUSEL_ALBUM" ? "Carrossel" : "Feed");
export const FORMATOS_FILTRO = ["todos", "Feed", "Reels", "Carrossel"] as const;
export const ORDENS = ["recentes", "interacoes", "alcance", "engajamento"] as const;
export const ORDEM_ROTULO: Record<(typeof ORDENS)[number], string> = { recentes: "Mais recentes", interacoes: "Mais interações", alcance: "Maior alcance", engajamento: "Maior engajamento" };
export type GrupoFormato = { formato: string; posts: number; interacoesMedia: number; alcanceMedio: number | null; engajamentoMedio: number | null };
export type Publicacoes = { janela: Janela; ano: string; anos: string[]; de: string; ate: string; conta: string | null; contaId: string | null; contas: ContaInstagram[]; formato: string; ordem: string; total: number; posts: PostCartao[]; grupos: GrupoFormato[]; melhor: PostCartao | null };

async function escolherConta(contaPedida?: string) {
  const contas = await contasInstagram();
  const escolhida = contas.find((c) => c.igId === contaPedida) ?? contas.find((c) => c.principal) ?? contas[0] ?? null;
  return { contas, escolhida, contaId: escolhida?.igId ?? "" };
}
const intervalo = (janela: Janela, hoje: string) => (janela === "ano" ? `${hoje.slice(0, 4)}-01-01` : janela === "todo" ? "0000-01-01" : addDays(hoje, -(Number(janela) - 1)));

/** "O que funcionou em cada publicação": posts do período com métricas e engajamento por post, filtro de formato e ordenação. */
export async function listarPublicacoes(actor: number, o: { janela?: string; formato?: string; ordem?: string; conta?: string; ano?: string }, agora = new Date()): Promise<Publicacoes> {
  await assertCan(actor, "relatorios", "ver");
  const janela: Janela = janelaValida(o.janela) ? o.janela : "90";
  const formato = (FORMATOS_FILTRO as readonly string[]).includes(o.formato ?? "") ? o.formato! : "todos";
  const ordem = (ORDENS as readonly string[]).includes(o.ordem ?? "") ? o.ordem! : "recentes";
  const { contas, escolhida, contaId } = await escolherConta(o.conta);
  const hojeReal = utcToLocal(agora).date;
  const ano = o.ano && /^\d{4}$/.test(o.ano) ? o.ano : hojeReal.slice(0, 4);
  const de = janela === "ano" ? `${ano}-01-01` : intervalo(janela, hojeReal);
  const hoje = janela === "ano" && `${ano}-12-31` < hojeReal ? `${ano}-12-31` : hojeReal;
  const linhas = await query<RowDataPacket>("SELECT id_externo, tipo, legenda, url, miniatura, publicado_em, alcance, curtidas, comentarios, salvamentos, compartilhamentos, visualizacoes FROM posts_externos WHERE rede = 'instagram' AND conta_id = ? ORDER BY publicado_em DESC LIMIT 1000", [contaId]);
  const todos: PostCartao[] = linhas.map(postDeLinha).filter((p) => { const d = utcToLocal(new Date(p.publicado_em)).date; return d >= de && d <= hoje; }).map((p) => ({ ...p, engajamento: engajamentoPost(p), formato: formatoDe(p) }));
  const media = (v: number[]) => (v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : null);
  const grupos: GrupoFormato[] = (["Feed", "Reels", "Carrossel"] as const).map((f) => {
    const g = todos.filter((p) => p.formato === f);
    const eng = g.map((p) => p.engajamento).filter((v): v is number => v != null);
    return { formato: f, posts: g.length, interacoesMedia: media(g.map((p) => p.interacoes)) ?? 0, alcanceMedio: media(g.map((p) => p.alcance).filter((v): v is number => v != null)), engajamentoMedio: eng.length ? Math.round((eng.reduce((a, b) => a + b, 0) / eng.length) * 10) / 10 : null };
  }).filter((g) => g.posts > 0);
  const filtrados = todos.filter((p) => formato === "todos" || p.formato === formato);
  const chave: Record<string, (p: PostCartao) => number> = { interacoes: (p) => p.interacoes, alcance: (p) => p.alcance ?? -1, engajamento: (p) => p.engajamento ?? -1, recentes: (p) => +new Date(p.publicado_em) };
  const ordenados = [...filtrados].sort((a, b) => chave[ordem](b) - chave[ordem](a));
  const melhor = [...todos].sort((a, b) => b.interacoes - a.interacoes)[0] ?? null;
  return { janela, ano, anos: await anosDisponiveis(contaId, hojeReal), de, ate: hoje, conta: escolhida?.usuario ?? null, contaId: escolhida?.igId ?? null, contas, formato, ordem, total: filtrados.length, posts: ordenados.slice(0, 120), grupos, melhor };
}

export type LinhaRanking = { periodo: string; seguidores: number | null; variacao: number | null; alcance: number | null; visualizacoes: number | null; visitasPerfil: number | null; interacoes: number | null; curtidas: number | null; comentarios: number | null; compartilhamentos: number | null; salvamentos: number | null; posts: number; reels: number };
export type RankingSeguidores = { agrupar: "mes" | "ano"; conta: string | null; contaId: string | null; contas: ContaInstagram[]; linhas: LinhaRanking[]; top: PostCartao[]; seguidoresHoje: number | null };

/** "Ranking e seguidores": métricas por mês ou por ano (seguidores, variação, totais, posts/reels) e o ranking dos 10 melhores posts. */
export async function gerarRanking(actor: number, o: { agrupar?: string; conta?: string }, agora = new Date()): Promise<RankingSeguidores> {
  await assertCan(actor, "relatorios", "ver");
  const agrupar = o.agrupar === "ano" ? "ano" : "mes";
  const { contas, escolhida, contaId } = await escolherConta(o.conta);
  const hoje = utcToLocal(agora).date;
  const [mensal, snaps, linhasPosts] = await Promise.all([
    query<RowDataPacket>(`SELECT periodo, ${SELECT_TOTAIS} FROM instagram_mensal WHERE conta_id = ? ORDER BY periodo ASC`, [contaId]),
    snapshots(contaId),
    query<RowDataPacket>("SELECT id_externo, tipo, legenda, url, miniatura, publicado_em, alcance, curtidas, comentarios, salvamentos, compartilhamentos, visualizacoes FROM posts_externos WHERE rede = 'instagram' AND conta_id = ? ORDER BY publicado_em DESC LIMIT 1000", [contaId]),
  ]);
  const posts: PostCartao[] = linhasPosts.map(postDeLinha).map((p) => ({ ...p, engajamento: engajamentoPost(p), formato: formatoDe(p) }));
  const chaveDe = (iso: string) => (agrupar === "ano" ? iso.slice(0, 4) : iso.slice(0, 7));
  const periodos = new Set<string>();
  mensal.forEach((m) => periodos.add(chaveDe(String(m.periodo))));
  posts.forEach((p) => periodos.add(chaveDe(utcToLocal(new Date(p.publicado_em)).date)));
  snaps.forEach((s) => periodos.add(chaveDe(s.dia)));
  const ordenados = [...periodos].sort();
  const seguidoresDe = (per: string) => { const x = snaps.filter((s) => chaveDe(s.dia) === per); return x.length ? x[x.length - 1].seguidores : null; };
  const linhas: LinhaRanking[] = ordenados.map((per, i) => {
    const ms = mensal.filter((m) => chaveDe(String(m.periodo)) === per).map(linhaTotais);
    const t = somar(ms);
    const dele = posts.filter((p) => chaveDe(utcToLocal(new Date(p.publicado_em)).date) === per);
    const seg = seguidoresDe(per), antes = i > 0 ? seguidoresDe(ordenados[i - 1]) : null;
    return { periodo: per, seguidores: seg, variacao: seg != null && antes != null ? seg - antes : null, alcance: t?.alcance ?? null, visualizacoes: t?.visualizacoes ?? null, visitasPerfil: t?.visitasPerfil ?? null, interacoes: t?.interacoes ?? null, curtidas: t?.curtidas ?? null, comentarios: t?.comentarios ?? null, compartilhamentos: t?.compartilhamentos ?? null, salvamentos: t?.salvamentos ?? null, posts: dele.filter((p) => p.tipo !== "REELS").length, reels: dele.filter((p) => p.tipo === "REELS").length };
  }).reverse().filter((l) => l.periodo <= (agrupar === "ano" ? hoje.slice(0, 4) : hoje.slice(0, 7)));
  const top = [...posts].sort((a, b) => b.interacoes - a.interacoes).slice(0, 10);
  return { agrupar, conta: escolhida?.usuario ?? null, contaId: escolhida?.igId ?? null, contas, linhas, top, seguidoresHoje: snaps.length ? snaps[snaps.length - 1].seguidores : null };
}

/** Informa à mão os seguidores de um mês SEM registro automático (a Meta não entrega o passado). Nunca sobrescreve coleta real. */
export async function informarSeguidoresMes(actor: number, contaPedida: string | undefined, mes: string, seguidores: number, agora = new Date()) {
  await assertCan(actor, "relatorios", "ver");
  await assertCan(actor, "integracoes", "gerir");
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(mes)) throw new DomainError("Informe o mês no formato AAAA-MM.");
  if (!Number.isInteger(seguidores) || seguidores < 0 || seguidores > 100_000_000) throw new DomainError("Número de seguidores inválido.");
  const hoje = utcToLocal(agora).date;
  if (mes > hoje.slice(0, 7)) throw new DomainError("Esse mês ainda não começou.");
  const { contaId } = await escolherConta(contaPedida);
  if (!contaId) throw new DomainError("Nenhuma conta do Instagram conectada.");
  const ja = await query<RowDataPacket>("SELECT 1 FROM metricas_conta WHERE rede = 'instagram' AND conta_id = ? AND dia LIKE ? LIMIT 1", [contaId, mes + "-%"]);
  if (ja.length) throw new DomainError("Esse mês já tem registro do sistema; o número manual só vale para meses sem registro.");
  const [a, m] = mes.split("-").map(Number);
  const ultimo = new Date(Date.UTC(a, m, 0)).getUTCDate();
  const dia = `${mes}-${String(ultimo).padStart(2, "0")}`;
  const alvo = dia > hoje ? hoje : dia;
  await execute("INSERT INTO metricas_conta (rede, conta_id, dia, seguidores) VALUES ('instagram', ?, ?, ?)", [contaId, alvo, seguidores]);
}
