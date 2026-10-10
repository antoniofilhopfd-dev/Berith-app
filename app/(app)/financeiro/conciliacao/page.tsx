import { requireUser } from "@/lib/auth/session";
import { contasECategorias, listarLancamentos } from "@/lib/services/financeiro";
import { can } from "@/lib/permissions";
import { Card, Empty } from "@/components/ui";
import { SubNav, Valor } from "@/components/fin-ui";
import { ActionForm, Field, inputCls } from "@/components/action-form";
import { brDate, todayLocal } from "@/lib/time";
import { conciliarAction } from "../actions";

export default async function Conciliacao({ searchParams }: { searchParams: Promise<{ mes?: string; conta?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const periodo = /^\d{4}-(0[1-9]|1[0-2])$/.test(sp.mes ?? "") ? sp.mes! : todayLocal().slice(0, 7);
  const { contas } = await contasECategorias();
  const contaId = Number(sp.conta) || contas[0]?.id;
  const [{ itens }, aprova] = await Promise.all([listarLancamentos(user.id, { mes: periodo, status: "aprovado", contaId }), can(user.id, "financeiro", "aprovar", null)]);
  return (
    <div className="space-y-4">
      <h1 className="font-titulo text-2xl text-verde">Conciliação</h1>
      <SubNav ativo="conciliacao" />
      <Card>
        <form className="grid grid-cols-2 gap-2"><input name="mes" type="month" defaultValue={periodo} aria-label="Mês" className={inputCls} />
          <select name="conta" defaultValue={contaId} aria-label="Conta" className={inputCls}>{contas.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}</select>
          <button className="col-span-2 min-h-11 rounded-lg bg-verde text-sm text-white">Carregar</button></form>
      </Card>
      {aprova ? (
        <Card title="Conferir com o extrato">
          {itens.length === 0 ? <Empty>Nenhum lançamento aprovado neste mês e conta.</Empty> : (
            <ActionForm action={conciliarAction} submit="Registrar conciliação" resetOnOk={false}>
              <input type="hidden" name="contaId" value={contaId} /><input type="hidden" name="periodo" value={periodo} />
              <ul className="divide-y divide-borda">
                {itens.map((l) => (
                  <li key={l.id}><label className="flex min-h-12 items-center gap-3 py-1 text-sm"><input type="checkbox" name="lancamento" value={l.id} defaultChecked={Boolean(l.conciliado)} className="h-5 w-5 shrink-0" />
                    <span className="min-w-0 flex-1"><span className="block truncate">{l.descricao}</span><span className="text-xs text-tinta/60">{brDate(String(l.data))}</span></span><Valor c={l.valor_centavos} tipo={l.tipo} /></label></li>
                ))}
              </ul>
              <Field label="Saldo final do extrato (R$)"><input name="saldo" required inputMode="decimal" placeholder="0,00" className={inputCls} /></Field>
              <p className="text-xs text-tinta/60">O sistema compara o saldo dos lançamentos marcados com o extrato e registra a diferença. Valores nunca são alterados.</p>
            </ActionForm>
          )}
        </Card>
      ) : <Card><Empty>Somente quem aprova lançamentos concilia.</Empty></Card>}
    </div>
  );
}
