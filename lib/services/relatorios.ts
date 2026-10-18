import type { RowDataPacket } from "mysql2/promise";
import { query } from "@/lib/db";
import { assertCan } from "@/lib/permissions";
import { REDES, type Formato, type Rede } from "@/lib/editorial";
import { addDays, isDate, localToUtc } from "@/lib/time";
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

const dias = (de: string, ate: string) => Math.round((new Date(ate + "T12:00:00Z").getTime() - new Date(de + "T12:00:00Z").getTime()) / 86400000) + 1;

export function validarPeriodo(de: string, ate: string) {
  if (!isDate(de) || !isDate(ate)) throw new DomainError("Período inválido.");
  if (ate < de) throw new DomainError("A data final não pode ser anterior à inicial.");
  if (dias(de, ate) > 400) throw new DomainError("Escolha um período de até 400 dias.");
}

async function somas(de: string, ate: string): Promise<Map<Rede, { publicadas: number; assistidas: number; comColeta: number; soma: Record<Metrica, number | null> }>> {
  const ini = localToUtc(de, "00:00"), fim = localToUtc(addDays(ate, 1), "00:00");
  const rows = await query<RowDataPacket>(
    `SELECT r.rede, COUNT(*) AS publicadas, SUM(r.assistida) AS assistidas, COUNT(x.id) AS com_coleta,
       SUM(x.alcance) AS alcance, SUM(x.impressoes) AS impressoes, SUM(x.curtidas) AS curtidas, SUM(x.comentarios) AS comentarios,
       SUM(x.compartilhamentos) AS compartilhamentos, SUM(x.salvamentos) AS salvamentos, SUM(x.visualizacoes) AS visualizacoes
     FROM publicacao_redes r
     LEFT JOIN metricas_publicacao x ON x.id = (SELECT MAX(y.id) FROM metricas_publicacao y WHERE y.publicacao_rede_id = r.id AND y.coletado_em < ?)
     WHERE r.envio = 'publicada' AND r.publicada_em >= ? AND r.publicada_em < ? GROUP BY r.rede`, [fim, ini, fim]);
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

export async function gerarRelatorio(actor: number, de: string, ate: string, comparar = true): Promise<Relatorio> {
  await assertCan(actor, "relatorios", "ver");
  validarPeriodo(de, ate);
  const n = dias(de, ate);
  const aAte = addDays(de, -1), aDe = addDays(de, -n);
  const [atual, ant, contas] = await Promise.all([somas(de, ate), comparar ? somas(aDe, aAte) : Promise.resolve(null), query<RowDataPacket>("SELECT rede FROM redes_contas WHERE status = 'conectada'")]);
  const conectadas = new Set(contas.map((c) => c.rede as Rede));
  const redes: LinhaRede[] = [];
  for (const rede of REDES) {
    const a = atual.get(rede), b = ant?.get(rede);
    redes.push({
      rede, publicadas: a?.publicadas ?? 0, assistidas: a?.assistidas ?? 0, comColeta: a?.comColeta ?? 0, conectada: conectadas.has(rede),
      metricas: celulas(rede, conectadas.has(rede), a), anterior: ant ? celulas(rede, conectadas.has(rede), b) : null, publicadasAnterior: ant ? b?.publicadas ?? 0 : null,
      seguidores: await seguidores(rede, de, ate),
    });
  }
  const ini = localToUtc(de, "00:00"), fim = localToUtc(addDays(ate, 1), "00:00");
  const formatos = await query<RowDataPacket>(
    `SELECT p.formato, COUNT(*) n FROM publicacao_redes r JOIN publicacoes p ON p.id = r.publicacao_id WHERE r.envio = 'publicada' AND r.publicada_em >= ? AND r.publicada_em < ? GROUP BY p.formato ORDER BY n DESC`, [ini, fim]);
  const pubs = await query<RowDataPacket>(
    `SELECT p.id, p.titulo, p.formato, r.rede, r.publicada_em, r.url_externa, r.assistida, x.id AS coleta,
       x.alcance, x.impressoes, x.curtidas, x.comentarios, x.compartilhamentos, x.salvamentos, x.visualizacoes
     FROM publicacao_redes r JOIN publicacoes p ON p.id = r.publicacao_id
     LEFT JOIN metricas_publicacao x ON x.id = (SELECT MAX(y.id) FROM metricas_publicacao y WHERE y.publicacao_rede_id = r.id AND y.coletado_em < ?)
     WHERE r.envio = 'publicada' AND r.publicada_em >= ? AND r.publicada_em < ? ORDER BY r.publicada_em DESC LIMIT 500`, [fim, ini, fim]);
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
