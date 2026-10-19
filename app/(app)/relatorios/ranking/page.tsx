import { contaPreferida } from "@/lib/auth/conta";
import { requireUser } from "@/lib/auth/session";
import { exigir } from "@/lib/auth/pagina";
import { permissoesDe } from "@/lib/permissions";
import { ORDENS_RANKING, ORDEM_RANKING_ROTULO, gerarRanking } from "@/lib/services/desempenho";
import { MESES } from "@/lib/services/relatorios";
import { Card, Empty } from "@/components/ui";
import { ActionForm, Field, inputCls } from "@/components/action-form";
import { RelNav } from "@/components/rel-nav";
import { carregarHistoricoAction, informarSeguidoresAction } from "../actions";
import { formatNumber } from "@/lib/format";

export const metadata = { title: "Relatórios — Ranking e seguidores" };
export const dynamic = "force-dynamic";

const v = (n: number | null) => (n == null ? <span className="text-xs text-tinta/40">—</span> : formatNumber(n));
const rotulo = (p: string) => (p.length === 4 ? p : `${MESES[Number(p.slice(5, 7)) - 1]} de ${p.slice(0, 4)}`);
const dataBr = (iso: string) => iso.split("-").reverse().join("/");
const campo = "mt-1 block min-h-10 rounded-lg border border-borda bg-white px-2 text-sm";

export default async function Ranking({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireUser();
  await exigir(user.id, "relatorios", "ver");
  const perms = await permissoesDe(user.id);
  const sp = await searchParams;
  const d = await gerarRanking(user.id, { ...sp, conta: sp.conta ?? (await contaPreferida()) });
  const cta = "";
  return (
    <div className="space-y-5">
      <header className="rounded-2xl border border-borda bg-cartao p-5">
        <h1 className="font-titulo text-2xl text-verde-escuro">Ranking e seguidores</h1>
        <p className="mt-1 text-sm text-tinta/70">Alcance, interação, seguidores e posts de cada {d.agrupar === "ano" ? "ano" : "mês"}, e o ranking das melhores publicações.{d.seguidoresHoje != null ? ` Seguidores hoje: ${formatNumber(d.seguidoresHoje)}.` : ""}{d.conta ? ` Conta: ${d.conta}.` : ""}</p>
        <div className="mt-3"><RelNav atual="ranking" conta={d.contas.length > 1 ? d.contaId : null} /></div>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <nav aria-label="Agrupar" className="flex gap-2">
          {(["mes", "ano"] as const).map((a) => <a key={a} href={`?agrupar=${a}${cta}`} aria-current={d.agrupar === a ? "page" : undefined} className={`rounded-full border px-4 py-1.5 text-sm font-medium ${d.agrupar === a ? "border-verde bg-verde text-white" : "border-borda bg-white hover:bg-fundo"}`}>{a === "mes" ? "Por mês" : "Por ano"}</a>)}
        </nav>
      </div>

      <Card title={`Métricas por ${d.agrupar === "ano" ? "ano" : "mês"}`} className="overflow-x-auto">
        {d.linhas.length === 0 ? <Empty>Sem dados ainda. Use “Atualizar dados do Instagram agora” na Visão geral e depois “Carregar histórico”.</Empty> : (
          <table className="w-full min-w-[980px] text-left text-sm">
            <caption className="sr-only">Métricas por período</caption>
            <thead className="border-b border-borda text-xs uppercase text-tinta/60"><tr><th scope="col" className="py-2">{d.agrupar === "ano" ? "Ano" : "Mês"}</th>{["Seguidores", "Variação", "Alcance", "Visualizações", "Visitas ao perfil", "Interações", "Curtidas", "Comentários", "Compart.", "Salvamentos", "Posts", "Reels"].map((h) => <th key={h} scope="col" className="px-2 text-right">{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-borda">{d.linhas.map((l) => (
              <tr key={l.periodo}><th scope="row" className="py-2 font-medium">{rotulo(l.periodo)}{l.parcial && <div className="text-[11px] font-normal text-tinta/60">em andamento (parcial)</div>}</th>
                <td className="px-2 text-right">{v(l.seguidores)}</td>
                <td className="px-2 text-right">{l.variacao == null ? <span className="text-xs text-tinta/40">—</span> : <span className={l.variacao >= 0 ? "text-green-700" : "text-red-700"}>{l.variacao >= 0 ? "+" : ""}{formatNumber(l.variacao)}</span>}</td>
                {[l.alcance, l.visualizacoes, l.visitasPerfil, l.interacoes, l.curtidas, l.comentarios, l.compartilhamentos, l.salvamentos, l.posts, l.reels].map((x, i) => <td key={i} className="px-2 text-right">{v(x)}</td>)}</tr>
            ))}</tbody>
          </table>
        )}
        <p className="mt-3 text-xs text-tinta/60">Alcance, visualizações e visitas somam os meses carregados (no ano, pessoas alcançadas em meses diferentes podem se repetir). Seguidores: a Meta não informa o histórico; o sistema guarda uma foto por sincronização{d.primeiraFoto ? ` desde ${dataBr(d.primeiraFoto)}` : ""}, então períodos anteriores ficam “—” até a primeira foto (ou até você informar o número abaixo). “Carregar histórico” busca até 12 meses de totais na Meta.</p>
      </Card>

      <Card title={`Ranking de conteúdos (${d.totalPosts})`} className="overflow-x-auto">
        <form method="get" className="mb-3 flex flex-wrap items-end gap-2" aria-label="Filtros do ranking">
          <input type="hidden" name="agrupar" value={d.agrupar} />
          <label className="text-xs">Período<select name="periodo" defaultValue={d.periodo} className={campo}>{d.opcoesPeriodo.map((o) => <option key={o.valor} value={o.valor}>{o.rotulo}</option>)}</select></label>
          <label className="text-xs">Ordenar por<select name="ordem" defaultValue={d.ordem} className={campo}>{ORDENS_RANKING.map((o) => <option key={o} value={o}>{ORDEM_RANKING_ROTULO[o]}</option>)}</select></label>
          <button className="min-h-10 rounded-lg bg-verde px-4 text-sm text-white">Aplicar</button>
        </form>
        {d.posts.length === 0 ? <Empty>Sem publicações neste período.</Empty> : (
          <table className="w-full min-w-[820px] text-left text-sm">
            <caption className="sr-only">Ranking de conteúdos</caption>
            <thead className="border-b border-borda text-xs uppercase text-tinta/60"><tr><th scope="col" className="w-10 py-2">#</th><th scope="col" className="w-14">Foto</th><th scope="col">Publicação</th>{["Alcance", "Curtidas", "Comentários", "Salvamentos", "Compartilh.", "Interações", "Engajamento"].map((h) => <th key={h} scope="col" className="px-2 text-right">{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-borda">{d.posts.map((p, i) => (
              <tr key={p.id}><td className="py-2 font-semibold text-verde-escuro">{i + 1}º</td>
                <td className="py-1">{p.miniatura /* eslint-disable-next-line @next/next/no-img-element */ ? <img src={p.miniatura} alt="" width={44} height={44} loading="lazy" referrerPolicy="no-referrer" className="h-11 w-11 rounded object-cover" /> : <span className="block h-11 w-11 rounded bg-borda/40" />}</td>
                <th scope="row" className="max-w-sm py-2 pr-2 font-normal">{p.url ? <a href={p.url} target="_blank" rel="noopener noreferrer" className="text-verde-escuro hover:underline">{(p.legenda ?? "Sem legenda").slice(0, 110)}</a> : (p.legenda ?? "Sem legenda").slice(0, 110)}<div className="text-xs text-tinta/60">{p.formato} · {new Date(p.publicado_em).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}</div></th>
                {[p.alcance, p.curtidas, p.comentarios, p.salvamentos, p.compartilhamentos].map((x, j) => <td key={j} className="px-2 text-right">{v(x)}</td>)}
                <td className="px-2 text-right font-semibold">{formatNumber(p.interacoes)}</td><td className="px-2 text-right">{p.engajamento == null ? "—" : `${p.engajamento.toLocaleString("pt-BR")}%`}</td></tr>
            ))}</tbody>
          </table>
        )}
        {d.totalPosts > d.posts.length && <p className="mt-2 text-xs text-tinta/60">Mostrando os {d.posts.length} primeiros de {d.totalPosts}.</p>}
      </Card>

      {d.conta && (
        <div className="grid gap-3 lg:grid-cols-2">
          <ActionForm action={carregarHistoricoAction} submit="Carregar histórico (12 meses)" resetOnOk={false} className="rounded-xl border border-borda bg-cartao p-3">
            <p className="text-xs text-tinta/60">Busca na Meta os totais dos últimos 12 meses (alcance, visitas, interações…).</p>
          </ActionForm>
          {perms.has("integracoes:gerir") && (
            <ActionForm action={informarSeguidoresAction} submit="Informar seguidores de um mês" resetOnOk className="rounded-xl border border-borda bg-cartao p-3">
              <input type="hidden" name="conta" value={d.contaId ?? ""} />
              <div className="grid gap-2 sm:grid-cols-2">
                <Field label="Mês"><input name="mes" type="month" required className={inputCls} /></Field>
                <Field label="Seguidores no fim do mês"><input name="seguidores" inputMode="numeric" required className={inputCls} /></Field>
              </div>
              <p className="text-xs text-tinta/60">Para meses anteriores à primeira coleta (a Meta não entrega esse histórico). Só vale para meses sem registro do sistema.</p>
            </ActionForm>
          )}
        </div>
      )}
    </div>
  );
}
