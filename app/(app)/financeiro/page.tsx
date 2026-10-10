import Link from "next/link";
import { requireUser } from "@/lib/auth/session";
import { painel } from "@/lib/services/financeiro";
import { can } from "@/lib/permissions";
import { Card } from "@/components/ui";
import { SubNav, Valor } from "@/components/fin-ui";
import { MESES } from "@/lib/time";
import { Plus } from "lucide-react";

export default async function Financeiro() {
  const user = await requireUser();
  const [p, criar] = await Promise.all([painel(user.id), can(user.id, "financeiro", "criar", null)]);
  const [ano, mes] = p.mes.split("-");
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="font-titulo text-2xl text-verde">Financeiro</h1>
        {criar && <Link href="/financeiro/novo" className="inline-flex min-h-11 items-center gap-1 rounded-lg bg-verde px-3 text-sm text-white"><Plus size={16} aria-hidden /> Lançamento</Link>}
      </div>
      <SubNav ativo="" />
      <Card title="Saldo atual (lançamentos aprovados)">
        <p className="text-3xl"><Valor c={p.saldo} /></p>
        <ul className="mt-3 divide-y divide-borda text-sm">{p.contas.map((c) => <li key={c.id} className="flex justify-between py-2"><span>{c.nome}</span><Valor c={c.saldo} /></li>)}</ul>
      </Card>
      <Card title={`${MESES[+mes - 1].charAt(0).toUpperCase() + MESES[+mes - 1].slice(1)} de ${ano}`}>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div><p className="text-tinta/60">Entradas</p><p className="text-lg"><Valor c={p.entradas} tipo="entrada" /></p></div>
          <div><p className="text-tinta/60">Saídas</p><p className="text-lg"><Valor c={p.saidas} tipo="saida" /></p></div>
        </div>
      </Card>
      <Card title="Aprovações">
        {p.pendentes === 0 ? <p className="text-sm text-tinta/60">Nenhum lançamento aguardando aprovação.</p> : <Link href="/financeiro/lancamentos?status=pendente" className="inline-flex min-h-11 items-center text-verde underline">{p.pendentes} lançamento(s) aguardando aprovação</Link>}
      </Card>
      <p className="text-xs text-tinta/60">Operações financeiras exigem conexão com o servidor; nada é salvo localmente ou em cache. Contribuições e presença não são usadas para avaliar a vida espiritual de ninguém.</p>
    </div>
  );
}
