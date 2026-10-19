import Link from "next/link";
import { requireUser } from "@/lib/auth/session";
import { exigir } from "@/lib/auth/pagina";
import { permissoesDe } from "@/lib/permissions";
import { ROTULO_TIPO, variacaoPct } from "@/lib/services/relatorios";
import { JANELAS, JANELA_ROTULO, gerarDesempenho, type Desempenho } from "@/lib/services/desempenho";
import { Card, Empty } from "@/components/ui";
import { ActionForm } from "@/components/action-form";
import { RelNav } from "@/components/rel-nav";
import { BarrasH, LinhaEvolucao, GRADIENTE_IG } from "@/components/graficos";
import { atualizarInstagramAction, carregarHistoricoAction } from "./actions";
import { formatDateTime, formatNumber } from "@/lib/format";

export const metadata = { title: "Relatórios" };
export const dynamic = "force-dynamic";

const brMes = (p: string) => `${p.slice(5, 7)}/${p.slice(0, 4)}`;
const brDia = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
const pct = (n: number) => `${n.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;

const Delta = ({ v, sufixo = "vs. período anterior" }: { v: number | null; sufixo?: string }) =>
  v == null ? null : <small className={`mt-1 block text-xs font-medium ${v >= 0 ? "text-green-700" : "text-red-700"}`}>{v >= 0 ? "▲" : "▼"} {Math.abs(v).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}% {sufixo}</small>;

function Kpi({ rotulo, valor, sub, delta }: { rotulo: string; valor: string; sub?: string; delta?: number | null }) {
  return (
    <div className="relative overflow-hidden rounded-xl border border-borda bg-cartao p-4 pl-5">
      <span aria-hidden className="absolute inset-y-0 left-0 w-1" style={{ background: "linear-gradient(180deg,#c13584,#f77737)" }} />
      <p className="text-[11px] font-semibold uppercase tracking-wide text-tinta/60">{rotulo}</p>
      <p className="mt-1 text-2xl font-semibold text-verde-escuro">{valor}</p>
      {sub && <small className="mt-1 block text-xs text-tinta/60">{sub}</small>}
      <Delta v={delta ?? null} />
    </div>
  );
}

function Painel({ d }: { d: Desempenho }) {
  const a = d.atual, p = d.anterior;
  const v = (c: keyof NonNullable<Desempenho["atual"]>) => variacaoPct(a?.[c], p?.[c]);
  const n = (x: number | null | undefined) => (x == null ? "—" : formatNumber(x));
  const semTotais = !a;
  const interacoes = a ? [["Curtidas", a.curtidas], ["Comentários", a.comentarios], ["Compartilhamentos", a.compartilhamentos], ["Salvamentos", a.salvamentos]] as const : [];
  return (
    <>
      {semTotais && (
        <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">Ainda não há totais da Meta para {d.rotulo.toLowerCase() === "todo" ? "este período" : `os últimos ${d.rotulo}`}. Use <strong>Atualizar dados do Instagram agora</strong>{d.janela === "ano" || d.janela === "todo" ? " e depois " : ""}{d.janela === "ano" || d.janela === "todo" ? <strong>Carregar histórico</strong> : null}.</p>
      )}
      <section aria-label="Indicadores" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Kpi rotulo="Seguidores" valor={n(d.seguidores.fim)} sub={d.seguidores.noPeriodo != null ? `${d.seguidores.noPeriodo >= 0 ? "+" : ""}${formatNumber(d.seguidores.noPeriodo)} no período` : "histórico começa na primeira coleta"} />
        <Kpi rotulo="Alcance" valor={n(a?.alcance)} delta={v("alcance")} />
        <Kpi rotulo="Impressões (visualizações)" valor={n(a?.visualizacoes)} delta={v("visualizacoes")} />
        <Kpi rotulo="Visitas ao perfil" valor={n(a?.visitasPerfil)} delta={v("visitasPerfil")} />
        <Kpi rotulo="Interações" valor={n(a?.interacoes)} delta={v("interacoes")} />
        <Kpi rotulo="Engajamento" valor={d.engajamento.atual == null ? "—" : pct(d.engajamento.atual)} sub="interações ÷ alcance" delta={variacaoPct(d.engajamento.atual, d.engajamento.anterior)} />
      </section>
      <p className="text-xs text-tinta/60">
        {d.rotulo === "Todo" ? "Todo o período sincronizado" : d.janela === "ano" ? `Ano ${d.ano}${d.ate < `${d.ano}-12-31` ? " (parcial)" : ""}` : `Últimos ${d.rotulo}`} · {d.conta ?? "—"} · {brDia(d.de)}/{d.de.slice(0, 4)} a {brDia(d.ate)}/{d.ate.slice(0, 4)} · {d.fonte === "meta" ? "totais lidos da Meta" : "soma dos meses sincronizados"} · {d.postsNoPeriodo} post(s) no período ({d.reels} reel(s)). Engajamento = interações ÷ alcance.
      </p>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Mix de formatos — produção registrada">
          {d.mix.length === 0 ? <Empty>Sem publicações neste período.</Empty> : <BarrasH itens={d.mix.map((f) => ({ rotulo: f.tipo, valor: f.posts, extra: `· ${f.pct}%` }))} formato={formatNumber} />}
          {d.mix.length > 0 && <p className="mt-3 text-xs text-tinta/60">Interações por post em média: {d.mix.map((f) => `${f.tipo} ${formatNumber(f.mediaInteracoes)}`).join(" · ")}.</p>}
        </Card>
        <Card title="Interações — como o público reage">
          {interacoes.length === 0 ? <Empty>Sem totais da Meta ainda.</Empty> : <BarrasH itens={interacoes.map(([rotulo, valor]) => ({ rotulo, valor: valor ?? 0 }))} formato={formatNumber} />}
          {interacoes.some(([, x]) => x == null) && <p className="mt-3 text-xs text-tinta/60">Barra vazia = a Meta não informou esse número.</p>}
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Evolução — seguidores por dia"><LinhaEvolucao pontos={d.serieSeguidores.map((s) => ({ x: s.dia, y: s.seguidores }))} rotuloX={brDia} formato={formatNumber} />
          {d.evolucaoSeguidores.length > 0 && <ul className="mt-3 space-y-1 text-sm">{d.evolucaoSeguidores.slice(-6).reverse().map((e) => <li key={e.periodo} className="flex justify-between"><span>{brMes(e.periodo)}</span><strong>{formatNumber(e.seguidores)}</strong></li>)}</ul>}
        </Card>
        <Card title="Destaques — melhores conteúdos">
          {d.destaques.length === 0 ? <Empty>Sem posts importados ainda.</Empty> : (
            <ul className="space-y-4 text-sm">{d.destaques.map((x) => (
              <li key={x.periodo}><p className="font-semibold">★ {x.periodo}</p>
                <ol className="mt-1 list-decimal space-y-1 pl-5">{x.posts.map((p, i) => <li key={i}>{p.url ? <a href={p.url} target="_blank" rel="noopener noreferrer" className="text-verde-escuro hover:underline">{(p.legenda ?? "Sem legenda").slice(0, 90)}</a> : (p.legenda ?? "Sem legenda").slice(0, 90)} <span className="text-tinta/60">— {formatNumber(p.interacoes)} interações</span></li>)}</ol></li>
            ))}</ul>
          )}
        </Card>
      </div>

      <Card title="Histórico social — por mês" className="overflow-x-auto">
        {d.historico.length === 0 ? <Empty>Sem meses carregados. Use <strong>Carregar histórico</strong>.</Empty> : (
          <table className="w-full min-w-[640px] text-left text-sm">
            <caption className="sr-only">Totais mensais da conta</caption>
            <thead className="border-b border-borda text-xs uppercase text-tinta/60"><tr><th scope="col" className="py-2">Período</th><th scope="col" className="px-2 text-right">Seguidores</th><th scope="col" className="px-2 text-right">Alcance</th><th scope="col" className="px-2 text-right">Impressões</th><th scope="col" className="px-2 text-right">Visitas</th><th scope="col" className="px-2 text-right">Interações</th></tr></thead>
            <tbody className="divide-y divide-borda">{d.historico.map((h) => (
              <tr key={h.periodo}><th scope="row" className="py-2 font-medium">{brMes(h.periodo)}</th>{[h.seguidores, h.alcance, h.visualizacoes, h.visitasPerfil, h.interacoes].map((x, i) => <td key={i} className="px-2 text-right">{x == null ? <span className="text-xs text-tinta/40">—</span> : formatNumber(x)}</td>)}</tr>
            ))}</tbody>
          </table>
        )}
      </Card>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <Card title="Melhor dia e horário — dados reais do Instagram">
          {d.horarios.melhor
            ? <p className="text-sm"><strong>{d.horarios.melhor.dia}</strong> (média {formatNumber(d.horarios.melhor.mediaDia)} interações) · por volta das <strong>{String(d.horarios.melhor.hora).padStart(2, "0")}h</strong> (média {formatNumber(d.horarios.melhor.mediaHora)}).<br /><span className="text-xs text-tinta/60">Confiança {d.horarios.melhor.confianca}{d.horarios.melhor.confianca === "baixa" ? ": poucos posts em cada dia/horário. Use como pista, não como regra" : ""}. Calculado com {d.horarios.totalPosts} publicações sincronizadas.</span></p>
            : <p className="text-sm text-tinta/60">Preciso de pelo menos {d.horarios.minimo} posts importados para indicar (há {d.horarios.totalPosts}).</p>}
        </Card>
        <Card title="Ranking de conteúdos — curtidas + comentários + compartilhamentos + salvamentos">
          {d.ranking.length === 0 ? <Empty>Sem publicações neste período.</Empty> : (
            <ol className="divide-y divide-borda text-sm">{d.ranking.map((p, i) => (
              <li key={p.id} className="grid grid-cols-[2rem_1fr] gap-2 py-2"><strong className="text-verde-escuro">{i + 1}º</strong>
                <div className="min-w-0"><p>{(p.legenda ?? "Sem legenda").slice(0, 160)}</p>
                  <p className="text-xs text-tinta/60">{(ROTULO_TIPO[p.tipo ?? ""] ?? p.tipo ?? "Post").toUpperCase()} · {p.publicado_em.toISOString().slice(0, 10)} · {formatNumber(p.interacoes)} interações{p.alcance != null ? ` · alcance ${formatNumber(p.alcance)}` : ""}{p.url ? <> · <a href={p.url} target="_blank" rel="noopener noreferrer" className="underline">abrir</a></> : null}</p></div></li>
            ))}</ol>
          )}
        </Card>
      </div>

      {d.comparativo && (
        <Card title="Comparativo entre contas — últimos 30 dias" className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-left text-sm">
            <caption className="sr-only">Comparativo entre as contas do Instagram</caption>
            <thead className="border-b border-borda text-xs uppercase text-tinta/60"><tr><th scope="col" className="py-2">Conta</th><th scope="col" className="px-2 text-right">Seguidores</th><th scope="col" className="px-2 text-right">Alcance</th><th scope="col" className="px-2 text-right">Interações</th><th scope="col" className="px-2 text-right">Posts</th></tr></thead>
            <tbody className="divide-y divide-borda">{d.comparativo.map((c) => (
              <tr key={c.igId}><th scope="row" className="py-2 font-medium"><Link href={`?janela=${d.janela}&conta=${c.igId}`} className="hover:underline">{c.usuario}</Link></th>{[c.seguidores, c.alcance, c.interacoes, c.posts].map((x, i) => <td key={i} className="px-2 text-right">{x == null ? <span className="text-xs text-tinta/40">—</span> : formatNumber(x)}</td>)}</tr>
            ))}</tbody>
          </table>
        </Card>
      )}

      <p className="text-xs text-tinta/60">Dados lidos da API oficial da Meta (somente leitura); o que ela não informa aparece como “—” — nada é estimado. Alcance e visualizações não somam entre períodos.{d.atualizadoEm ? ` Última atualização: ${formatDateTime(d.atualizadoEm)}.` : ""}</p>
    </>
  );
}

export default async function Relatorios({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireUser();
  await exigir(user.id, "relatorios", "ver");
  const perms = await permissoesDe(user.id);
  const sp = await searchParams;
  const d = await gerarDesempenho(user.id, sp.janela, sp.conta, new Date(), sp.ano);
  const cta = d.contaId && d.contas.length > 1 ? `&conta=${d.contaId}` : "";
  const link = (j: string, ano?: string) => `?janela=${j}${ano ? `&ano=${ano}` : ""}${cta}`;
  return (
    <div className="space-y-5">
      <header className="relative overflow-hidden rounded-2xl border border-borda bg-cartao p-5">
        <div aria-hidden className="absolute right-4 top-4 h-14 w-14 rounded-2xl" style={{ background: GRADIENTE_IG }} />
        <h1 className="font-titulo text-2xl text-verde-escuro">Desempenho e conteúdo</h1>
        <p className="mt-1 max-w-2xl text-sm text-tinta/70">Crescimento, alcance, interação e formatos em uma visão própria de social media. Métricas sincronizadas automaticamente da API do Instagram{d.atualizadoEm ? ` (última: ${formatDateTime(d.atualizadoEm)})` : ""}.</p>
        <div className="mt-3"><RelNav atual="geral" conta={d.contas.length > 1 ? d.contaId : null} /></div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <nav aria-label="Período" className="flex flex-wrap gap-2">{JANELAS.map((j) => <Link key={j} href={link(j, j === "ano" ? d.ano : undefined)} aria-current={d.janela === j ? "page" : undefined} className={`rounded-full border px-4 py-1.5 text-sm font-medium ${d.janela === j ? "border-verde bg-verde text-white" : "border-borda bg-white hover:bg-fundo"}`}>{JANELA_ROTULO[j]}</Link>)}</nav>
          {d.janela === "ano" && (
            <nav aria-label="Ano" className="flex flex-wrap gap-1.5">{[...d.anos].reverse().map((a) => <Link key={a} href={link("ano", a)} aria-current={d.ano === a ? "page" : undefined} className={`rounded-lg border px-3 py-1 text-sm ${d.ano === a ? "border-cobre bg-cobre/15 font-semibold" : "border-borda bg-white hover:bg-fundo"}`}>{a}</Link>)}</nav>
          )}
          {d.contas.length > 1 && (
            <form method="get" className="flex items-center gap-2"><input type="hidden" name="janela" value={d.janela} />{d.janela === "ano" && <input type="hidden" name="ano" value={d.ano} />}
              <label className="sr-only" htmlFor="conta">Conta</label>
              <select id="conta" name="conta" defaultValue={d.contaId ?? ""} className="min-h-9 rounded-lg border border-borda bg-white px-2 text-sm">{d.contas.map((c) => <option key={c.igId} value={c.igId}>{c.usuario}{c.principal ? " (principal)" : ""}</option>)}</select>
              <button className="min-h-9 rounded-lg border border-borda bg-white px-3 text-sm hover:bg-fundo">Ver</button></form>
          )}
          <span className="ml-auto flex flex-wrap gap-2">
            <Link href={`/relatorios/mensal${d.contaId && d.contas.length > 1 ? `?conta=${d.contaId}` : ""}`} className="inline-flex min-h-9 items-center rounded-lg border border-borda bg-white px-3 text-sm hover:bg-fundo">Relatório mensal (imprimir)</Link>
            {perms.has("relatorios:exportar") && <a href={`/api/relatorios/exportar?tipo=desempenho&formato=xlsx&janela=${d.janela}&ano=${d.ano}&conta=${d.contaId ?? ""}`} className="inline-flex min-h-9 items-center rounded-lg border border-borda bg-white px-3 text-sm hover:bg-fundo">Excel</a>}
          </span>
        </div>
      </header>

      {d.conta ? (
        <div className="grid gap-3 lg:grid-cols-2">
          <ActionForm action={atualizarInstagramAction} submit="Atualizar dados do Instagram agora" resetOnOk={false} className="rounded-xl border border-borda bg-cartao p-3">
            <p className="text-xs text-tinta/60">Busca agora na Meta posts, seguidores e totais ({d.conta}). O agendador faz isso sozinho a cada hora.</p>
          </ActionForm>
          <ActionForm action={carregarHistoricoAction} submit="Carregar histórico (12 meses)" resetOnOk={false} className="rounded-xl border border-borda bg-cartao p-3">
            <p className="text-xs text-tinta/60">Preenche os meses anteriores (Ano, Todo e histórico mensal). A Meta só entrega o que ainda guarda.</p>
          </ActionForm>
        </div>
      ) : <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">Nenhuma conta do Instagram conectada. Conecte em Configurações → Redes sociais.</p>}

      <Painel d={d} />
    </div>
  );
}
