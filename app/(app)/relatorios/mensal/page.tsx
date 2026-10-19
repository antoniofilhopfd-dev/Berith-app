import { contaPreferida } from "@/lib/auth/conta";
import { requireUser } from "@/lib/auth/session";
import { exigir } from "@/lib/auth/pagina";
import { permissoesDe } from "@/lib/permissions";
import { CAMPOS, CAMPO_ROTULO, ROTULO_TIPO, gerarRelatorioMensal, mesAnterior, mesAtual, mesValido, variacaoPct, type RelatorioMensal } from "@/lib/services/relatorios";
import { Card, Empty, PageHeader } from "@/components/ui";
import { ActionForm } from "@/components/action-form";
import { RelNav } from "@/components/rel-nav";
import { BotaoImprimir } from "@/components/imprimir";
import { atualizarInstagramAction, carregarHistoricoAction } from "../actions";
import { formatDateTime, formatNumber } from "@/lib/format";

export const metadata = { title: "Relatório mensal" };
export const dynamic = "force-dynamic";

const Variacao = ({ a, b }: { a: number | null | undefined; b: number | null | undefined }) => {
  const v = variacaoPct(a, b);
  if (v == null) return null;
  return <small className={`block text-xs ${v >= 0 ? "text-green-700" : "text-red-700"}`}>{v >= 0 ? "▲" : "▼"} {Math.abs(v).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}% vs. mês anterior</small>;
};
const Kpi = ({ rotulo, valor, anterior }: { rotulo: string; valor: number | null; anterior?: number | null }) => (
  <div className="print-keep rounded-lg border border-borda bg-white p-3">
    <small className="block text-xs text-tinta/70">{rotulo}</small>
    <b className="mt-1 block text-xl text-verde-escuro">{valor == null ? "—" : formatNumber(valor)}</b>
    <Variacao a={valor} b={anterior} />
  </div>
);

function Corpo({ r }: { r: RelatorioMensal }) {
  const top = r.posts.slice(0, 5);
  const semDados = !r.atual && r.posts.length === 0;
  return (
    <>
      <Card title={`Indicadores de ${r.rotuloMes}`}>
        {semDados && <p className="mb-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900 no-print">Ainda não há dados deste mês. Use <strong>Atualizar dados do Instagram agora</strong> (mês atual e anterior) ou <strong>Carregar histórico</strong> (até 12 meses).</p>}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Kpi rotulo="Seguidores" valor={r.seguidores} anterior={r.seguidoresAnterior} />
          {CAMPOS.map((c) => <Kpi key={c} rotulo={CAMPO_ROTULO[c]} valor={r.atual?.[c] ?? null} anterior={r.anteriorTotais?.[c]} />)}
          <Kpi rotulo="Publicações" valor={r.posts.length} />
        </div>
        <p className="mt-3 text-xs text-tinta/70">
          Formatos publicados: {r.formatos.length ? r.formatos.map((f) => `${f.tipo} ${f.posts}`).join(" · ") : "—"}.
          {r.seguidores != null && r.seguidoresAnterior != null ? ` Variação de seguidores no mês: ${r.seguidores - r.seguidoresAnterior >= 0 ? "+" : ""}${formatNumber(r.seguidores - r.seguidoresAnterior)}.` : " O histórico de seguidores começa quando o Berith passa a coletar (a Meta não entrega o passado)."}
        </p>
      </Card>

      <Card title="Melhores publicações do mês — top 5 por interações" className="overflow-x-auto">
        {top.length === 0 ? <Empty>Sem publicações neste mês.</Empty> : <TabelaPosts posts={top} />}
      </Card>

      <div className="grid gap-4 lg:grid-cols-2 print-keep">
        <Card title="Melhor dia e horário">
          {r.horarios.melhor
            ? <p className="text-sm"><strong>{r.horarios.melhor.dia}</strong> (média {formatNumber(r.horarios.melhor.mediaDia)} interações) e por volta das <strong>{String(r.horarios.melhor.hora).padStart(2, "0")}h</strong> (média {formatNumber(r.horarios.melhor.mediaHora)}). <span className="text-xs text-tinta/60">Confiança {r.horarios.melhor.confianca}, com base em {r.horarios.amostra} posts reais.</span></p>
            : <p className="text-sm text-tinta/60">Preciso de pelo menos {r.horarios.minimo} posts importados para indicar (há {r.horarios.amostra}).</p>}
        </Card>
        <Card title="Desempenho por formato">
          {r.formatos.length === 0 ? <Empty>Sem publicações neste mês.</Empty> : <ul className="space-y-1 text-sm">{r.formatos.map((f) => <li key={f.tipo} className="flex justify-between gap-2"><span>{f.tipo} <span className="text-xs text-tinta/60">({f.posts})</span></span><span>{formatNumber(f.mediaInteracoes)} <span className="text-xs text-tinta/60">interações em média</span></span></li>)}</ul>}
        </Card>
      </div>

      {r.posts.length > 5 && (
        <Card title={`Todas as publicações de ${r.rotuloMes}`} className="overflow-x-auto"><TabelaPosts posts={r.posts} compacta /></Card>
      )}

      <p className="text-xs text-tinta/60">
        Dados lidos da API oficial da Meta (somente leitura); o que ela não informa aparece como “—” — nada é estimado. Alcance e visualizações não somam entre meses.
        {r.atualizadoEm ? ` Última atualização: ${formatDateTime(r.atualizadoEm)}.` : ""}
      </p>
    </>
  );
}

function TabelaPosts({ posts, compacta = false }: { posts: RelatorioMensal["posts"]; compacta?: boolean }) {
  return (
    <table className="w-full min-w-[720px] text-left text-sm">
      <caption className="sr-only">Publicações e suas métricas</caption>
      <thead className="border-b border-borda text-xs uppercase text-tinta/60"><tr>{!compacta && <th scope="col" className="w-16 py-2">Foto</th>}<th scope="col" className="py-2">Publicação</th><th scope="col" className="px-2 text-right">Alcance</th><th scope="col" className="px-2 text-right">Curtidas</th><th scope="col" className="px-2 text-right">Coment.</th><th scope="col" className="px-2 text-right">Salvos</th><th scope="col" className="px-2 text-right">Compart.</th><th scope="col" className="px-2 text-right">Interações</th></tr></thead>
      <tbody className="divide-y divide-borda">{posts.map((p) => (
        <tr key={p.id} className="print-keep">
          {!compacta && <td className="py-2 pr-2">{p.miniatura ? <img src={p.miniatura} alt="" width={48} height={48} className="h-12 w-12 rounded object-cover" referrerPolicy="no-referrer" /> : <span className="block h-12 w-12 rounded bg-borda/40" />}</td>}
          <th scope="row" className="max-w-xs py-2 pr-2 font-medium">{p.url ? <a href={p.url} target="_blank" rel="noopener noreferrer" className="text-verde-escuro hover:underline">{(p.legenda ?? "Sem legenda").slice(0, 70)}</a> : (p.legenda ?? "Sem legenda").slice(0, 70)}<div className="text-xs font-normal text-tinta/60">{ROTULO_TIPO[p.tipo ?? ""] ?? p.tipo ?? "Post"} · {formatDateTime(p.publicado_em)}</div></th>
          {[p.alcance, p.curtidas, p.comentarios, p.salvamentos, p.compartilhamentos].map((v, i) => <td key={i} className="px-2 text-right">{v == null ? <span className="text-xs text-tinta/40">—</span> : formatNumber(v)}</td>)}
          <td className="px-2 text-right font-semibold">{formatNumber(p.interacoes)}</td>
        </tr>
      ))}</tbody>
    </table>
  );
}

export default async function Relatorios({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireUser();
  await exigir(user.id, "relatorios", "ver");
  const perms = await permissoesDe(user.id);
  const sp = await searchParams;
  const mes = sp.mes && mesValido(sp.mes) ? sp.mes : mesAtual();
  const rel = await gerarRelatorioMensal(user.id, mes, sp.conta ?? (await contaPreferida()));
  const ig = rel.conta;
  return (
    <div className="space-y-5">
      <PageHeader titulo={`Relatório mensal — Instagram${ig ? " " + ig : ""}`} sub={`${rel.rotuloMes}, comparado com ${mesAnterior(mes).split("-").reverse().join("/")}. ${ig ? `Conta: ${ig}${rel.contas.length > 1 ? ` (${rel.contas.length} contas acompanhadas)` : ""}.` : "Nenhuma conta do Instagram conectada."}`}>
        <span className="no-print flex flex-wrap gap-2">
          <BotaoImprimir />
          {perms.has("relatorios:exportar") && <a href={`/api/relatorios/exportar?formato=pdf&mes=${mes}&conta=${rel.contaId ?? ""}`} className="inline-flex min-h-10 items-center rounded-lg border border-borda bg-white px-4 text-sm hover:bg-fundo">Baixar PDF</a>}
          {perms.has("relatorios:exportar") && <a href={`/api/relatorios/exportar?formato=xlsx&mes=${mes}&conta=${rel.contaId ?? ""}`} className="inline-flex min-h-10 items-center rounded-lg border border-borda bg-white px-4 text-sm hover:bg-fundo">Excel</a>}
        </span>
      </PageHeader>

      <RelNav atual="mensal" conta={rel.contas.length > 1 ? rel.contaId : null} />
      <form method="get" className="no-print flex flex-wrap items-end gap-2 rounded-xl border border-borda bg-cartao p-3" aria-label="Mês">
        <label className="text-xs">Mês<input type="month" name="mes" defaultValue={mes} max={mesAtual()} className="mt-1 block min-h-10 rounded-lg border border-borda px-2 text-sm" /></label>
        <button className="min-h-10 rounded-lg bg-verde px-4 text-sm text-white">Atualizar tela</button>
      </form>

      {ig && (
        <div className="no-print grid gap-3 lg:grid-cols-2">
          <ActionForm action={atualizarInstagramAction} submit="Atualizar dados do Instagram agora" resetOnOk={false} className="rounded-xl border border-borda bg-cartao p-3">
            <p className="text-xs text-tinta/60">Busca agora na Meta os posts, seguidores e as métricas do mês atual e do anterior. O agendador faz isso sozinho a cada hora.</p>
          </ActionForm>
          <ActionForm action={carregarHistoricoAction} submit="Carregar histórico (12 meses)" resetOnOk={false} className="rounded-xl border border-borda bg-cartao p-3">
            <p className="text-xs text-tinta/60">Preenche os meses anteriores para poder escolher qualquer mês acima. A Meta só entrega o que ainda guarda.</p>
          </ActionForm>
        </div>
      )}

      <Corpo r={rel} />
    </div>
  );
}
