import { CAMPOS, CAMPO_ROTULO, ROTULO_TIPO, variacaoPct, type RelatorioMensal } from "@/lib/services/relatorios";
import { utcToLocal } from "@/lib/time";
import type { Desempenho } from "@/lib/services/desempenho";
import type { Planilha } from "./xlsx";
import type { DocumentoPdf } from "./pdf";

const br = (d: string) => d.split("-").reverse().join("/");
const when = (d: Date) => { const l = utcToLocal(new Date(d)); return `${br(l.date)} ${l.time}`; };
const n = (v: number | null) => (v == null ? "" : v);
const fmt = (v: number | null) => (v == null ? "-" : new Intl.NumberFormat("pt-BR").format(v));
const mesBr = (m: string) => `${m.slice(5, 7)}/${m.slice(0, 4)}`;
export const NOTA_METRICAS = "Dados lidos da API oficial da Meta; o que ela não informa fica em branco (nada é estimado). Alcance e visualizações não somam entre meses.";

export function paraPlanilhas(r: RelatorioMensal): Planilha[] {
  const resumo: Planilha = {
    nome: "Resumo", larguras: [26, 16, 16, 14],
    linhas: [
      ["Indicador", `Atual (${mesBr(r.mes)})`, `Anterior (${mesBr(r.anterior)})`, "Variação %"],
      ["Seguidores (fim do mês)", n(r.seguidores), n(r.seguidoresAnterior), n(variacaoPct(r.seguidores, r.seguidoresAnterior))],
      ...CAMPOS.map((c) => [CAMPO_ROTULO[c], n(r.atual?.[c] ?? null), n(r.anteriorTotais?.[c] ?? null), n(variacaoPct(r.atual?.[c], r.anteriorTotais?.[c]))]),
      ["Publicações no mês", r.posts.length, "", ""], ["  Feed/Carrossel/Stories", r.feed, "", ""], ["  Reels", r.reels, "", ""],
      [], [`Conta: ${r.conta ?? "não conectada"}`], [NOTA_METRICAS],
    ],
  };
  const posts: Planilha = {
    nome: "Posts do mês", larguras: [6, 12, 18, 50, 12, 12, 12, 12, 14, 14, 40],
    linhas: [["#", "Tipo", "Publicado em", "Legenda", "Alcance", "Curtidas", "Comentários", "Salvamentos", "Compartilhamentos", "Interações", "Link"],
      ...r.posts.map((p, i) => [i + 1, ROTULO_TIPO[p.tipo ?? ""] ?? p.tipo ?? "", when(p.publicado_em), (p.legenda ?? "").replace(/\s+/g, " ").slice(0, 200), n(p.alcance), n(p.curtidas), n(p.comentarios), n(p.salvamentos), n(p.compartilhamentos), p.interacoes, p.url ?? ""])],
  };
  return [resumo, posts];
}

export function paraPdf(r: RelatorioMensal, ministerio: string): DocumentoPdf {
  return {
    titulo: `Relatório mensal - Instagram${r.conta ? " " + r.conta : ""}`, subtitulo: `${ministerio} · ${r.rotuloMes}`,
    notas: [NOTA_METRICAS, `Comparado com ${mesBr(r.anterior)}. Publicações no mês: ${r.posts.length} (${r.feed} feed/carrossel/stories, ${r.reels} reels).`,
      ...(r.horarios.melhor ? [`Melhor dia e horário: ${r.horarios.melhor.dia}, ${String(r.horarios.melhor.hora).padStart(2, "0")}h (confiança ${r.horarios.melhor.confianca}, ${r.horarios.amostra} posts).`] : [])],
    tabelas: [
      { titulo: `Indicadores de ${r.rotuloMes}`, colunas: [{ rotulo: "Indicador", largura: 130 }, { rotulo: "Atual", largura: 70, alinhar: "dir" }, { rotulo: "Anterior", largura: 70, alinhar: "dir" }, { rotulo: "Variação", largura: 70, alinhar: "dir" }],
        linhas: [
          ["Seguidores", fmt(r.seguidores), fmt(r.seguidoresAnterior), r.seguidores != null && r.seguidoresAnterior != null ? String(r.seguidores - r.seguidoresAnterior) : "-"],
          ...CAMPOS.map((c) => { const v = variacaoPct(r.atual?.[c], r.anteriorTotais?.[c]); return [CAMPO_ROTULO[c], fmt(r.atual?.[c] ?? null), fmt(r.anteriorTotais?.[c] ?? null), v == null ? "-" : `${v > 0 ? "+" : ""}${v}%`]; }),
        ] },
      { titulo: "Melhores publicações do mês (por interações)", colunas: [{ rotulo: "Publicação", largura: 170 }, { rotulo: "Alcance", largura: 45, alinhar: "dir" }, { rotulo: "Curt.", largura: 38, alinhar: "dir" }, { rotulo: "Coment.", largura: 42, alinhar: "dir" }, { rotulo: "Salvos", largura: 40, alinhar: "dir" }, { rotulo: "Compart.", largura: 44, alinhar: "dir" }, { rotulo: "Interações", largura: 48, alinhar: "dir" }],
        linhas: r.posts.slice(0, 15).map((p) => [`${when(p.publicado_em).slice(0, 5)} ${(p.legenda ?? "(sem legenda)").replace(/\s+/g, " ").slice(0, 38)}`, fmt(p.alcance), fmt(p.curtidas), fmt(p.comentarios), fmt(p.salvamentos), fmt(p.compartilhamentos), String(p.interacoes)]) },
    ],
  };
}

/** Excel do painel de desempenho (período escolhido): indicadores vs. anterior, formatos, ranking e histórico mensal. */
export function desempenhoParaPlanilhas(d: Desempenho): Planilha[] {
  const eng = (v: number | null) => (v == null ? "" : v);
  const resumo: Planilha = {
    nome: "Resumo", larguras: [28, 16, 16, 14],
    linhas: [
      ["Indicador", `Atual (${d.rotulo})`, "Período anterior", "Variação %"],
      ["Seguidores (agora)", n(d.seguidores.fim), "", ""], ["Seguidores no período", n(d.seguidores.noPeriodo), "", ""],
      ...CAMPOS.map((c) => [CAMPO_ROTULO[c], n(d.atual?.[c] ?? null), n(d.anterior?.[c] ?? null), n(variacaoPct(d.atual?.[c], d.anterior?.[c]))]),
      ["Engajamento % (interações ÷ alcance)", eng(d.engajamento.atual), eng(d.engajamento.anterior), n(variacaoPct(d.engajamento.atual, d.engajamento.anterior))],
      ["Publicações no período", d.postsNoPeriodo, "", ""], ["  Reels", d.reels, "", ""],
      [], [`Conta: ${d.conta ?? "não conectada"} · ${br(d.de)} a ${br(d.ate)}`], [NOTA_METRICAS],
    ],
  };
  const formatos: Planilha = { nome: "Formatos", larguras: [26, 12, 10, 20], linhas: [["Formato", "Posts", "%", "Interações por post (média)"], ...d.mix.map((f) => [f.tipo, f.posts, f.pct, f.mediaInteracoes])] };
  const ranking: Planilha = {
    nome: "Ranking", larguras: [6, 12, 18, 50, 12, 12, 40],
    linhas: [["#", "Tipo", "Publicado em", "Legenda", "Interações", "Alcance", "Link"],
      ...d.ranking.map((p, i) => [i + 1, ROTULO_TIPO[p.tipo ?? ""] ?? p.tipo ?? "", when(p.publicado_em), (p.legenda ?? "").replace(/\s+/g, " ").slice(0, 200), p.interacoes, n(p.alcance), p.url ?? ""])],
  };
  const historico: Planilha = {
    nome: "Histórico mensal", larguras: [12, 14, 12, 14, 12, 12],
    linhas: [["Mês", "Seguidores", "Alcance", "Impressões", "Visitas", "Interações"], ...d.historico.map((h) => [mesBr(h.periodo), n(h.seguidores), n(h.alcance), n(h.visualizacoes), n(h.visitasPerfil), n(h.interacoes)])],
  };
  return [resumo, formatos, ranking, historico];
}
