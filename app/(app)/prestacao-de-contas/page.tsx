import { requireUser } from "@/lib/auth/session";
import { prestacaoPublica } from "@/lib/services/financeiro";
import { Card, Empty } from "@/components/ui";
import { Valor } from "@/components/fin-ui";
import { MESES } from "@/lib/time";

export default async function Prestacao() {
  await requireUser();
  const lista = await prestacaoPublica();
  return (
    <div className="space-y-4">
      <h1 className="font-titulo text-2xl text-verde">Prestação de contas</h1>
      <p className="text-sm text-tinta/70">Resumo mensal aprovado e publicado pela tesouraria. Mostra apenas totais por categoria: nenhuma pessoa é identificada.</p>
      {lista.length === 0 ? <Card><Empty>Nenhuma prestação de contas publicada ainda.</Empty></Card> : lista.map((p) => {
        const [a, m] = p.periodo.split("-");
        return (
          <Card key={p.periodo} title={`${MESES[+m - 1].charAt(0).toUpperCase() + MESES[+m - 1].slice(1)} de ${a}`}>
            <dl className="grid grid-cols-2 gap-y-1 text-sm"><dt className="text-tinta/70">Entradas</dt><dd className="text-right"><Valor c={p.entradas} tipo="entrada" /></dd><dt className="text-tinta/70">Saídas</dt><dd className="text-right"><Valor c={p.saidas} tipo="saida" /></dd><dt className="font-medium">Saldo ao final do mês</dt><dd className="text-right"><Valor c={p.saldoFinal} /></dd></dl>
            <ul className="mt-3 divide-y divide-borda text-sm">{p.categorias.map((c) => <li key={c.nome + c.tipo} className="flex justify-between py-1.5"><span>{c.nome}</span><Valor c={c.total} tipo={c.tipo} /></li>)}</ul>
          </Card>
        );
      })}
    </div>
  );
}
