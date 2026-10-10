import { requireUser } from "@/lib/auth/session";
import { periodos } from "@/lib/services/financeiro";
import { can } from "@/lib/permissions";
import { Badge, Card, Empty } from "@/components/ui";
import { SubNav, Valor } from "@/components/fin-ui";
import { ActionForm, Field, inputCls } from "@/components/action-form";
import { brDate, todayLocal, utcToLocal } from "@/lib/time";
import { fecharPeriodoAction, publicarAction, reabrirPeriodoAction } from "../actions";

export default async function Periodos() {
  const user = await requireUser();
  const [lista, fecha, reabre] = await Promise.all([periodos(user.id), can(user.id, "financeiro", "aprovar", null), can(user.id, "financeiro", "permissoes", null)]);
  return (
    <div className="space-y-4">
      <h1 className="font-titulo text-2xl text-verde">Fechamento de períodos</h1>
      <SubNav ativo="periodos" />
      <Card title="Períodos fechados">
        {lista.length === 0 ? <Empty>Nenhum período fechado.</Empty> : (
          <ul className="divide-y divide-borda">
            {lista.map((p) => (
              <li key={p.periodo} className="py-3 text-sm">
                <div className="flex items-center justify-between"><span className="font-medium">{p.periodo.split("-").reverse().join("/")}</span><span>Saldo final: <Valor c={p.saldo_final_centavos} /></span></div>
                <p className="text-xs text-tinta/60">Fechado em {brDate(utcToLocal(p.fechado_em).date)} {p.publicado ? <Badge>publicado aos membros</Badge> : <Badge>não publicado</Badge>}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {fecha && <ActionForm action={publicarAction} submit={p.publicado ? "Retirar prestação de contas" : "Publicar prestação de contas"} className="space-y-0"><input type="hidden" name="periodo" value={p.periodo} /><input type="hidden" name="publicar" value={p.publicado ? "0" : "1"} /></ActionForm>}
                </div>
                {reabre && (
                  <details className="mt-2">
                    <summary className="flex min-h-11 cursor-pointer items-center text-red-700">Reabrir este período</summary>
                    <ActionForm action={reabrirPeriodoAction} submit="Reabrir período" danger className="mt-2">
                      <input type="hidden" name="periodo" value={p.periodo} />
                      <Field label="Motivo (fica registrado na auditoria)"><input name="motivo" required minLength={3} maxLength={255} className={inputCls} /></Field>
                    </ActionForm>
                  </details>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
      {fecha && (
        <Card title="Fechar um mês">
          <p className="mb-2 text-xs text-tinta/60">Só meses já encerrados e sem lançamentos pendentes. Depois de fechado, ninguém lança, edita ou aprova nesse mês; reabrir exige a administração e fica registrado.</p>
          <ActionForm action={fecharPeriodoAction} submit="Fechar período"><Field label="Mês"><input name="periodo" type="month" required max={todayLocal().slice(0, 7)} className={inputCls} /></Field></ActionForm>
        </Card>
      )}
    </div>
  );
}
