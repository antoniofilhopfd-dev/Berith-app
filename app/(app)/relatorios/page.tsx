import Link from "next/link";
import { requireUser } from "@/lib/auth/session";
import { exigir } from "@/lib/auth/pagina";
import { permissoesDe } from "@/lib/permissions";
import { METRICAS, METRICA_ROTULO, gerarRelatorio, textoCelula, validarPeriodo, variacao, type Celula } from "@/lib/services/relatorios";
import { Badge, Card, Empty, PageHeader, Stat } from "@/components/ui";
import { FormatoTag, RedeTag } from "@/components/pub-ui";
import { DomainError } from "@/lib/services/errors";
import { FORMATO_ROTULO, REDE_ROTULO } from "@/lib/editorial";
import { addDays, brDate, utcToLocal } from "@/lib/time";
import { formatDateTime, formatNumber } from "@/lib/format";

export const metadata = { title: "Relatórios" };
export const dynamic = "force-dynamic";

const Valor = ({ c, anterior }: { c: Celula; anterior?: Celula | null }) => {
  if (c.estado !== "valor") return <span className={`text-xs ${c.estado === "indisponivel" ? "text-tinta/40" : "text-tinta/60"}`} title={c.estado === "indisponivel" ? "A plataforma não fornece esta métrica pela API oficial." : c.estado === "nao_conectada" ? "Rede sem conta conectada." : "Conectada, ainda sem coleta."}>{textoCelula(c)}</span>;
  const v = variacao(c, anterior);
  return <span>{formatNumber(c.valor)}{v != null && <span className={`ml-1 text-xs ${v >= 0 ? "text-green-700" : "text-red-700"}`}>{v >= 0 ? "▲" : "▼"} {Math.abs(v)}%</span>}</span>;
};

export default async function Relatorios({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireUser();
  await exigir(user.id, "relatorios", "ver");
  const perms = await permissoesDe(user.id);
  const sp = await searchParams;
  const hoje = utcToLocal(new Date()).date;
  const ate = sp.ate ?? hoje, de = sp.de ?? addDays(ate, -29), comparar = sp.comparar !== "0";
  let rel, erro: string | null = null;
  try { validarPeriodo(de, ate); rel = await gerarRelatorio(user.id, de, ate, comparar); } catch (e) { if (e instanceof DomainError) erro = e.message; else throw e; }
  const atalho = (d: number, rotulo: string) => <Link key={rotulo} href={`?de=${addDays(hoje, -(d - 1))}&ate=${hoje}${comparar ? "" : "&comparar=0"}`} className="rounded-lg border border-borda bg-white px-3 py-2 text-sm hover:bg-fundo">{rotulo}</Link>;
  const qs = `de=${de}&ate=${ate}${comparar ? "" : "&comparar=0"}`;
  return (
    <div className="space-y-5">
      <PageHeader titulo="Relatórios orgânicos" sub="Apenas métricas oficiais das plataformas. Nada é estimado ou inventado.">
        {perms.has("relatorios:exportar") && rel && <><a href={`/api/relatorios/exportar?formato=pdf&${qs}`} className="inline-flex min-h-10 items-center rounded-lg bg-verde px-4 text-sm text-white">Exportar PDF</a><a href={`/api/relatorios/exportar?formato=xlsx&${qs}`} className="inline-flex min-h-10 items-center rounded-lg border border-borda bg-white px-4 text-sm hover:bg-fundo">Exportar Excel</a></>}
      </PageHeader>
      <form method="get" className="flex flex-wrap items-end gap-2 rounded-xl border border-borda bg-cartao p-3" aria-label="Período">
        <label className="text-xs">De<input type="date" name="de" defaultValue={de} className="mt-1 block min-h-10 rounded-lg border border-borda px-2 text-sm" /></label>
        <label className="text-xs">Até<input type="date" name="ate" defaultValue={ate} className="mt-1 block min-h-10 rounded-lg border border-borda px-2 text-sm" /></label>
        <label className="flex min-h-10 items-center gap-2 text-sm"><input type="checkbox" name="comparar" value="1" defaultChecked={comparar} className="h-4 w-4" /> Comparar com o período anterior</label>
        {!comparar && <input type="hidden" name="comparar" value="0" />}
        <button className="min-h-10 rounded-lg bg-verde px-4 text-sm text-white">Atualizar</button>
        <span className="ml-auto flex flex-wrap gap-2">{atalho(7, "7 dias")}{atalho(30, "30 dias")}{atalho(90, "90 dias")}</span>
      </form>
      {erro && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{erro}</p>}
      {rel && (
        <>
          <section aria-label="Totais" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat rotulo="Publicações no período" valor={rel.totais.publicadas} sub={rel.totais.anterior != null ? `${rel.totais.anterior} no período anterior` : undefined} />
            <Stat rotulo="Automáticas" valor={rel.totais.automaticas} sub="publicadas pela API" />
            <Stat rotulo="Assistidas" valor={rel.totais.assistidas} sub="publicadas manualmente" />
            <Stat rotulo="Redes conectadas" valor={rel.redes.filter((r) => r.conectada).length} sub={`de ${rel.redes.length}`} href={perms.has("integracoes:ver") ? "/configuracoes/redes" : undefined} />
          </section>
          <Card title="Desempenho por rede" className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-left text-sm">
              <caption className="sr-only">Métricas por rede social no período</caption>
              <thead className="border-b border-borda text-xs uppercase text-tinta/60"><tr><th scope="col" className="py-2 pr-3">Rede</th><th scope="col" className="px-2 text-right">Publicadas</th>{METRICAS.map((m) => <th key={m} scope="col" className="px-2 text-right">{METRICA_ROTULO[m]}</th>)}</tr></thead>
              <tbody className="divide-y divide-borda">{rel.redes.map((r) => (
                <tr key={r.rede}><th scope="row" className="py-2 pr-3 font-medium"><RedeTag rede={r.rede} comNome />{!r.conectada && <Badge tom="cinza">não conectada</Badge>}</th>
                  <td className="px-2 text-right">{r.publicadas}{r.publicadasAnterior != null && r.publicadasAnterior > 0 && <span className="ml-1 text-xs text-tinta/60">({r.publicadasAnterior})</span>}</td>
                  {METRICAS.map((m) => <td key={m} className="px-2 text-right"><Valor c={r.metricas[m]} anterior={r.anterior?.[m]} /></td>)}</tr>
              ))}</tbody>
            </table>
            <p className="mt-3 text-xs text-tinta/60"><strong>indisponível</strong>: a API oficial da rede não fornece a métrica. <strong>não conectada</strong>: rede sem conta conectada. <strong>sem dados</strong>: conectada, mas ainda sem coleta (a coleta roda pelo agendador). Publicações feitas de forma assistida não têm métricas automáticas.</p>
          </Card>
          <div className="grid gap-4 lg:grid-cols-2">
            <Card title="Seguidores">
              <ul className="divide-y divide-borda text-sm">{rel.redes.map((r) => <li key={r.rede} className="flex items-center justify-between gap-2 py-2"><RedeTag rede={r.rede} comNome />{r.seguidores.fim == null ? <span className="text-xs text-tinta/60">{r.conectada ? "sem dados" : "não conectada"}</span> : <span>{formatNumber(r.seguidores.fim)} <span className={`text-xs ${(r.seguidores.variacao ?? 0) >= 0 ? "text-green-700" : "text-red-700"}`}>{r.seguidores.variacao == null ? "" : `${r.seguidores.variacao >= 0 ? "+" : ""}${r.seguidores.variacao}`}</span></span>}</li>)}</ul>
            </Card>
            <Card title="Formatos publicados">{rel.formatos.length === 0 ? <Empty>Sem publicações no período.</Empty> : <ul className="space-y-1 text-sm">{rel.formatos.map((f) => <li key={f.formato} className="flex justify-between"><span>{FORMATO_ROTULO[f.formato]}</span><strong>{f.publicadas}</strong></li>)}</ul>}</Card>
          </div>
          <Card title="Desempenho por publicação" className="overflow-x-auto">
            {rel.publicacoes.length === 0 ? <Empty>Nenhuma publicação concluída neste período.</Empty> : (
              <table className="w-full min-w-[760px] text-left text-sm">
                <caption className="sr-only">Métricas por publicação</caption>
                <thead className="border-b border-borda text-xs uppercase text-tinta/60"><tr><th scope="col" className="py-2">Publicação</th><th scope="col">Rede</th><th scope="col">Data</th>{(["alcance", "curtidas", "comentarios", "compartilhamentos", "salvamentos", "visualizacoes"] as const).map((m) => <th key={m} scope="col" className="px-2 text-right">{METRICA_ROTULO[m]}</th>)}</tr></thead>
                <tbody className="divide-y divide-borda">{rel.publicacoes.map((p) => (
                  <tr key={`${p.id}-${p.rede}`}><th scope="row" className="py-2 pr-2 font-medium"><Link href={`/producao/${p.id}`} className="text-verde-escuro hover:underline">{p.titulo}</Link><div className="font-normal"><FormatoTag formato={p.formato} /> {p.assistida && <Badge tom="cinza">assistida</Badge>}</div></th>
                    <td><span className="sr-only">{REDE_ROTULO[p.rede]}</span><RedeTag rede={p.rede} /></td><td className="text-xs">{formatDateTime(p.publicada_em)}</td>
                    {(["alcance", "curtidas", "comentarios", "compartilhamentos", "salvamentos", "visualizacoes"] as const).map((m) => <td key={m} className="px-2 text-right">{p.valores[m] == null ? <span className="text-xs text-tinta/40">{p.assistida ? "manual" : p.coletada ? "—" : "sem coleta"}</span> : formatNumber(p.valores[m])}</td>)}</tr>
                ))}</tbody>
              </table>
            )}
          </Card>
          <p className="text-xs text-tinta/60">Período: {brDate(rel.de)} a {brDate(rel.ate)}{rel.anteriorDe ? ` · comparado com ${brDate(rel.anteriorDe)} a ${brDate(rel.anteriorAte!)}` : ""}.</p>
        </>
      )}
    </div>
  );
}
