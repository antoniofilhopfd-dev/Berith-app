import { requireUser } from "@/lib/auth/session";
import { relatorioMensal } from "@/lib/services/financeiro";
import { can } from "@/lib/permissions";
import { Card, Empty } from "@/components/ui";
import { SubNav, Valor } from "@/components/fin-ui";
import { inputCls } from "@/components/action-form";
import { MESES, todayLocal } from "@/lib/time";

export default async function Relatorio({ searchParams }: { searchParams: Promise<{ mes?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const periodo = /^\d{4}-(0[1-9]|1[0-2])$/.test(sp.mes ?? "") ? sp.mes! : todayLocal().slice(0, 7);
  const [r, exporta] = await Promise.all([relatorioMensal(user.id, periodo), can(user.id, "financeiro", "exportar", null)]);
  const [a, m] = periodo.split("-");
  const grupo = (tipo: "entrada" | "saida") => r.categorias.filter((c) => c.tipo === tipo);
  return (
    <div className="space-y-4">
      <h1 className="font-titulo text-2xl text-verde">Relatório mensal</h1>
      <SubNav ativo="relatorio" />
      <form className="flex gap-2"><input name="mes" type="month" defaultValue={periodo} aria-label="Mês" className={inputCls} /><button className="min-h-11 rounded-lg bg-verde px-4 text-sm text-white">Ver</button></form>
      <Card title={`${MESES[+m - 1].charAt(0).toUpperCase() + MESES[+m - 1].slice(1)} de ${a}${r.fechado ? " — período fechado" : ""}`}>
        <dl className="grid grid-cols-2 gap-y-2 text-sm">
          <dt className="text-tinta/70">Saldo anterior</dt><dd className="text-right"><Valor c={r.saldoAnterior} /></dd>
          <dt className="text-tinta/70">Entradas</dt><dd className="text-right"><Valor c={r.entradas} tipo="entrada" /></dd>
          <dt className="text-tinta/70">Saídas</dt><dd className="text-right"><Valor c={r.saidas} tipo="saida" /></dd>
          <dt className="font-medium">Saldo final</dt><dd className="text-right text-lg"><Valor c={r.saldoFinal} /></dd>
        </dl>
        {r.pendentes > 0 && <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">{r.pendentes} lançamento(s) pendente(s) neste mês ainda não entram nos totais.</p>}
      </Card>
      {(["entrada", "saida"] as const).map((t) => (
        <Card key={t} title={t === "entrada" ? "Entradas por categoria" : "Saídas por categoria"}>
          {grupo(t).length === 0 ? <Empty>Sem movimentos.</Empty> : <ul className="divide-y divide-borda text-sm">{grupo(t).map((c) => <li key={c.nome} className="flex justify-between py-2"><span>{c.nome} <span className="text-xs text-tinta/50">({c.qtd})</span></span><Valor c={c.total} tipo={t} /></li>)}</ul>}
        </Card>
      ))}
      {exporta && <a href={`/api/financeiro/exportar?periodo=${periodo}`} className="inline-flex min-h-11 items-center rounded-lg border border-verde px-4 text-sm text-verde">Exportar CSV do mês (registrado na auditoria)</a>}
    </div>
  );
}
