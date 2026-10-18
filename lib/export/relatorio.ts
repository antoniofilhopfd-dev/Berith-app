import { FORMATO_ROTULO, REDE_ROTULO } from "@/lib/editorial";
import { METRICAS, METRICA_ROTULO, textoCelula, type Relatorio } from "@/lib/services/relatorios";
import { utcToLocal } from "@/lib/time";
import type { Planilha } from "./xlsx";
import type { DocumentoPdf } from "./pdf";

const br = (d: string) => d.split("-").reverse().join("/");
const num = (v: number | null) => (v == null ? "" : v);
const when = (d: Date) => { const l = utcToLocal(new Date(d)); return `${br(l.date)} ${l.time}`; };

export const NOTA_METRICAS = "Somente métricas oficiais das plataformas. 'indisponível' = a API não fornece; 'não conectada' = rede sem conta conectada; 'sem dados' = conectada, mas ainda sem coleta.";

export function paraPlanilhas(r: Relatorio): Planilha[] {
  const resumo: Planilha = {
    nome: "Resumo", larguras: [22, 14, 14, ...METRICAS.map(() => 16)],
    linhas: [
      ["Rede", "Publicadas", "Assistidas (manuais)", ...METRICAS.map((m) => METRICA_ROTULO[m]), "Seguidores (início)", "Seguidores (fim)", "Variação"],
      ...r.redes.map((x) => [REDE_ROTULO[x.rede], x.publicadas, x.assistidas, ...METRICAS.map((m) => { const c = x.metricas[m]; return c.estado === "valor" ? c.valor : textoCelula(c); }), num(x.seguidores.inicio), num(x.seguidores.fim), num(x.seguidores.variacao)]),
      [], [`Período: ${br(r.de)} a ${br(r.ate)}`], [NOTA_METRICAS],
    ],
  };
  const pubs: Planilha = {
    nome: "Publicações", larguras: [8, 40, 14, 12, 18, 12, ...METRICAS.map(() => 14), 40],
    linhas: [
      ["ID", "Título", "Rede", "Formato", "Publicada em", "Origem", ...METRICAS.map((m) => METRICA_ROTULO[m]), "Link"],
      ...r.publicacoes.map((p) => [p.id, p.titulo, REDE_ROTULO[p.rede], FORMATO_ROTULO[p.formato], when(p.publicada_em), p.assistida ? "assistida (manual)" : "automática", ...METRICAS.map((m) => p.valores[m] ?? ""), p.url ?? ""]),
    ],
  };
  const comp: Planilha | null = r.anteriorDe ? {
    nome: "Comparação", larguras: [22, 18, 18, 14],
    linhas: [["Rede / métrica", `Atual (${br(r.de)}–${br(r.ate)})`, `Anterior (${br(r.anteriorDe)}–${br(r.anteriorAte!)})`, "Variação %"],
      ...r.redes.flatMap((x) => [[`${REDE_ROTULO[x.rede]} · publicadas`, x.publicadas, x.publicadasAnterior ?? "", x.publicadasAnterior ? Math.round(((x.publicadas - x.publicadasAnterior) / x.publicadasAnterior) * 100) : ""] as (string | number)[],
        ...METRICAS.map((m) => { const a = x.metricas[m], b = x.anterior?.[m]; return [`${REDE_ROTULO[x.rede]} · ${METRICA_ROTULO[m]}`, a.estado === "valor" ? a.valor : textoCelula(a), b ? (b.estado === "valor" ? b.valor : textoCelula(b)) : "", a.estado === "valor" && b?.estado === "valor" && b.valor ? Math.round(((a.valor - b.valor) / b.valor) * 100) : ""] as (string | number)[]; })])],
  } : null;
  const formatos: Planilha = { nome: "Formatos", larguras: [18, 14], linhas: [["Formato", "Publicadas"], ...r.formatos.map((f) => [FORMATO_ROTULO[f.formato], f.publicadas])] };
  return [resumo, pubs, ...(comp ? [comp] : []), formatos];
}

export function paraPdf(r: Relatorio, ministerio: string): DocumentoPdf {
  const fm = (c: ReturnType<typeof textoCelula> | string) => String(c);
  return {
    titulo: "Relatório de desempenho orgânico", subtitulo: `${ministerio} · ${br(r.de)} a ${br(r.ate)}`,
    notas: [NOTA_METRICAS, r.anteriorDe ? `Comparado com ${br(r.anteriorDe)} a ${br(r.anteriorAte!)}.` : "Sem comparação de períodos.", `Publicadas: ${r.totais.publicadas} (${r.totais.automaticas} automáticas, ${r.totais.assistidas} assistidas/manuais).`],
    tabelas: [
      { titulo: "Resumo por rede", colunas: [{ rotulo: "Rede", largura: 70 }, { rotulo: "Publ.", largura: 40, alinhar: "dir" }, { rotulo: "Alcance", largura: 60, alinhar: "dir" }, { rotulo: "Curtidas", largura: 60, alinhar: "dir" }, { rotulo: "Coment.", largura: 60, alinhar: "dir" }, { rotulo: "Compart.", largura: 60, alinhar: "dir" }, { rotulo: "Salvam.", largura: 60, alinhar: "dir" }, { rotulo: "Visualiz.", largura: 60, alinhar: "dir" }],
        linhas: r.redes.map((x) => [REDE_ROTULO[x.rede], String(x.publicadas), ...(["alcance", "curtidas", "comentarios", "compartilhamentos", "salvamentos", "visualizacoes"] as const).map((m) => fm(textoCelula(x.metricas[m])))]) },
      { titulo: "Seguidores", colunas: [{ rotulo: "Rede", largura: 90 }, { rotulo: "Início", largura: 70, alinhar: "dir" }, { rotulo: "Fim", largura: 70, alinhar: "dir" }, { rotulo: "Variação", largura: 70, alinhar: "dir" }],
        linhas: r.redes.map((x) => [REDE_ROTULO[x.rede], x.seguidores.inicio == null ? "sem dados" : String(x.seguidores.inicio), x.seguidores.fim == null ? "sem dados" : String(x.seguidores.fim), x.seguidores.variacao == null ? "-" : String(x.seguidores.variacao)]) },
      { titulo: "Desempenho por publicação", colunas: [{ rotulo: "Título", largura: 150 }, { rotulo: "Rede", largura: 50 }, { rotulo: "Data", largura: 70 }, { rotulo: "Alcance", largura: 45, alinhar: "dir" }, { rotulo: "Curt.", largura: 38, alinhar: "dir" }, { rotulo: "Coment.", largura: 42, alinhar: "dir" }, { rotulo: "Visual.", largura: 45, alinhar: "dir" }],
        linhas: r.publicacoes.map((p) => [p.titulo, REDE_ROTULO[p.rede], when(p.publicada_em).slice(0, 5), ...(["alcance", "curtidas", "comentarios", "visualizacoes"] as const).map((m) => (p.valores[m] == null ? "-" : String(p.valores[m])))]) },
    ],
  };
}
