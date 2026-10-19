import type { RowDataPacket } from "mysql2/promise";
import { query } from "@/lib/db";
import { assertCan, can } from "@/lib/permissions";
import { datasNoPeriodo, type DataEspecial } from "@/lib/datas";
import { addDays, localToUtc, utcToLocal } from "@/lib/time";
import type { Formato, Rede, Status } from "@/lib/editorial";

/** Contagens exibidas no menu (selos). Só consulta o que o usuário pode ver. */
export async function contagensMenu(userId: number, perms: Set<string>): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  if (perms.has("aprovacao:ver")) {
    out["/aprovacoes"] = Number((await query<RowDataPacket>("SELECT COUNT(*) n FROM publicacoes WHERE status = 'em_revisao'"))[0].n);
  }
  if (perms.has("producao:ver")) {
    out["/producao"] = Number((await query<RowDataPacket>(
      "SELECT COUNT(*) n FROM publicacoes WHERE responsavel_id = ? AND status IN ('rascunho','em_producao','ajustes_solicitados')", [userId]))[0].n);
  }
  if (perms.has("publicacao:ver")) {
    out["/publicacoes"] = Number((await query<RowDataPacket>("SELECT COUNT(*) n FROM publicacao_redes WHERE envio = 'falhou'"))[0].n);
  }
  return out;
}

export type ItemAgenda = { id: number; titulo: string; formato: Formato; status: Status; publicar_em: Date; redes: string | null };
export type ItemPendencia = { id: number; titulo: string; status: Status; prazo: Date | null; motivo: "atrasada" | "ajustes" | "prazo" | "aprovar" };
export type Falha = { id: number; publicacao_id: number; rede: Rede; titulo: string; ultimo_erro: string | null };

export type Dashboard = {
  agendadas: ItemAgenda[]; totalAgendadas: number;
  aguardandoAprovacao: { id: number; titulo: string; responsavel_nome: string | null; atualizado_em: Date }[];
  emProducao: Record<string, number>; totalEmProducao: number;
  publicadasMes: number; publicadasMesAnterior: number; publicadasPorRede: { rede: Rede; total: number }[];
  proximasDatas: DataEspecial[];
  pendencias: ItemPendencia[];
  falhas: Falha[];
  desempenho: { redesComDados: number; alcance: number | null; engajamento: number | null; publicacoesComMetricas: number } ;
  redesConectadas: number;
};

export async function dashboard(actor: number, agora = new Date(), contaId?: string): Promise<Dashboard> {
  await assertCan(actor, "producao", "ver");
  // Filtro por conta do Instagram (seletor do topo): publicações dela + as que ainda não têm conta; envios dela + os sem conta.
  const pc = contaId ? " AND (EXISTS (SELECT 1 FROM publicacao_redes cr WHERE cr.publicacao_id = p.id AND cr.conta_id = ?) OR NOT EXISTS (SELECT 1 FROM publicacao_redes cr WHERE cr.publicacao_id = p.id AND cr.conta_id IS NOT NULL))" : "";
  const rc = contaId ? " AND (r.conta_id = ? OR r.conta_id IS NULL)" : "";
  const A = contaId ? [contaId] : [];
  const hoje = utcToLocal(agora).date;
  const meiaNoite = (d: string) => localToUtc(d, "00:00");
  const inicioMes = `${hoje.slice(0, 7)}-01`;
  const mesAnt = new Date(`${inicioMes}T12:00:00Z`); mesAnt.setUTCMonth(mesAnt.getUTCMonth() - 1);
  const inicioMesAnt = mesAnt.toISOString().slice(0, 10);
  const mesSeg = new Date(`${inicioMes}T12:00:00Z`); mesSeg.setUTCMonth(mesSeg.getUTCMonth() + 1);
  const fimMes = mesSeg.toISOString().slice(0, 10);

  const [agendadas, totalAg, aguard, prod, pubMes, pubAnt, porRede, proprias, pendMinhas, atrasadasEquipe, falhas, contas, desemp] = await Promise.all([
    query<ItemAgenda & RowDataPacket>(
      `SELECT p.id, p.titulo, p.formato, p.status, p.publicar_em, (SELECT GROUP_CONCAT(r.rede ORDER BY r.rede) FROM publicacao_redes r WHERE r.publicacao_id = p.id) AS redes
       FROM publicacoes p WHERE p.status = 'agendado' AND p.publicar_em >= ?${pc} ORDER BY p.publicar_em LIMIT 8`, [agora, ...A]),
    query<RowDataPacket>(`SELECT COUNT(*) n FROM publicacoes p WHERE p.status = 'agendado'${pc}`, A),
    query<RowDataPacket>(`SELECT p.id, p.titulo, u.nome AS responsavel_nome, p.atualizado_em FROM publicacoes p LEFT JOIN users u ON u.id = p.responsavel_id WHERE p.status = 'em_revisao'${pc} ORDER BY p.atualizado_em LIMIT 6`, A),
    query<RowDataPacket>(`SELECT p.status, COUNT(*) n FROM publicacoes p WHERE p.status IN ('rascunho','em_producao','em_revisao','ajustes_solicitados','aprovado')${pc} GROUP BY p.status`, A),
    query<RowDataPacket>(`SELECT COUNT(*) n FROM publicacao_redes r WHERE r.envio = 'publicada' AND r.publicada_em >= ? AND r.publicada_em < ?${rc}`, [meiaNoite(inicioMes), meiaNoite(fimMes), ...A]),
    query<RowDataPacket>(`SELECT COUNT(*) n FROM publicacao_redes r WHERE r.envio = 'publicada' AND r.publicada_em >= ? AND r.publicada_em < ?${rc}`, [meiaNoite(inicioMesAnt), meiaNoite(inicioMes), ...A]),
    query<RowDataPacket>(`SELECT r.rede, COUNT(*) total FROM publicacao_redes r WHERE r.envio = 'publicada' AND r.publicada_em >= ? AND r.publicada_em < ?${rc} GROUP BY r.rede ORDER BY total DESC`, [meiaNoite(inicioMes), meiaNoite(fimMes), ...A]),
    query<RowDataPacket>("SELECT nome, dia, anual FROM datas_especiais"),
    query<RowDataPacket>(
      `SELECT id, titulo, status, prazo FROM publicacoes WHERE responsavel_id = ? AND status IN ('rascunho','em_producao','ajustes_solicitados') ORDER BY (status = 'ajustes_solicitados') DESC, prazo IS NULL, prazo LIMIT 10`, [actor]),
    query<RowDataPacket>(`SELECT id, titulo, status, prazo FROM publicacoes WHERE status IN ('rascunho','em_producao','ajustes_solicitados') AND prazo IS NOT NULL AND prazo < ? ORDER BY prazo LIMIT 10`, [agora]),
    query<Falha & RowDataPacket>(`SELECT r.id, r.publicacao_id, r.rede, p.titulo, r.ultimo_erro FROM publicacao_redes r JOIN publicacoes p ON p.id = r.publicacao_id WHERE r.envio = 'falhou'${rc} ORDER BY r.id DESC LIMIT 8`, A),
    query<RowDataPacket>("SELECT COUNT(*) n FROM redes_contas WHERE status = 'conectada'"),
    query<RowDataPacket>(
      `SELECT COUNT(DISTINCT x.publicacao_rede_id) AS pubs, COUNT(DISTINCT r.rede) AS redes, SUM(x.alcance) AS alcance,
         SUM(COALESCE(x.curtidas,0) + COALESCE(x.comentarios,0) + COALESCE(x.compartilhamentos,0) + COALESCE(x.salvamentos,0)) AS eng
       FROM metricas_publicacao x JOIN publicacao_redes r ON r.id = x.publicacao_rede_id
       WHERE x.id = (SELECT MAX(y.id) FROM metricas_publicacao y WHERE y.publicacao_rede_id = x.publicacao_rede_id) AND r.publicada_em >= DATE_SUB(?, INTERVAL 30 DAY)${rc}`, [agora, ...A]),
  ]);

  const pend: ItemPendencia[] = [];
  const vistos = new Set<number>();
  for (const p of atrasadasEquipe) { vistos.add(p.id); pend.push({ id: p.id, titulo: p.titulo, status: p.status, prazo: p.prazo, motivo: "atrasada" }); }
  for (const p of pendMinhas) {
    if (vistos.has(p.id)) continue;
    pend.push({ id: p.id, titulo: p.titulo, status: p.status, prazo: p.prazo, motivo: p.status === "ajustes_solicitados" ? "ajustes" : "prazo" });
  }
  if (await can(actor, "aprovacao", "aprovar")) for (const a of aguard.slice(0, 3)) pend.push({ id: a.id, titulo: a.titulo, status: "em_revisao", prazo: null, motivo: "aprovar" });

  const emProducao: Record<string, number> = {};
  for (const r of prod) emProducao[r.status] = Number(r.n);
  const d = desemp[0];
  const semMetricas = Number(d.pubs) === 0;
  return {
    agendadas, totalAgendadas: Number(totalAg[0].n),
    aguardandoAprovacao: aguard as Dashboard["aguardandoAprovacao"],
    emProducao, totalEmProducao: Object.values(emProducao).reduce((a, b) => a + b, 0),
    publicadasMes: Number(pubMes[0].n), publicadasMesAnterior: Number(pubAnt[0].n),
    publicadasPorRede: porRede.map((r) => ({ rede: r.rede as Rede, total: Number(r.total) })),
    proximasDatas: datasNoPeriodo(hoje, addDays(hoje, 30), proprias.map((p) => ({ nome: p.nome as string, dia: String(p.dia), anual: Boolean(p.anual) }))).slice(0, 6),
    pendencias: pend.slice(0, 10),
    falhas,
    desempenho: { publicacoesComMetricas: Number(d.pubs), redesComDados: Number(d.redes), alcance: semMetricas ? null : Number(d.alcance ?? 0), engajamento: semMetricas ? null : Number(d.eng ?? 0) },
    redesConectadas: Number(contas[0].n),
  };
}
