import Link from "next/link";
import { requireUser } from "@/lib/auth/session";
import { listMyAssignments, listShiftUnits, myUnavailability } from "@/lib/services/escalas";
import { Badge, Card, Empty } from "@/components/ui";
import { ActionForm, Field, inputCls } from "@/components/action-form";
import { TIPO_LABEL, formatTime } from "@/lib/format";
import { brDate, utcToLocal } from "@/lib/time";
import { disponivelAction, indisponivelAction, responderEscalaAction } from "./actions";

export default async function Escalas() {
  const user = await requireUser();
  const [minhas, unidades, indisp] = await Promise.all([listMyAssignments(user.id, new Date()), listShiftUnits(user.id), myUnavailability(user.id)]);
  return (
    <div className="space-y-4">
      <h1 className="font-titulo text-2xl text-vinho">Escalas</h1>
      <Card title="Minhas escalas">
        {minhas.length === 0 ? <Empty>Você não está escalado(a) nos próximos dias.</Empty> : (
          <ul className="divide-y divide-borda">
            {minhas.map((e) => (
              <li key={e.assignment_id} className="py-3">
                <Link href={`/escalas/${e.id}`} className="block">
                  <span className="font-medium">{e.titulo}</span>
                  <span className="block text-sm text-tinta/70">{brDate(utcToLocal(e.inicio).date)} · {formatTime(e.inicio)} – {formatTime(e.fim)} · {e.unit_nome}{e.funcao && ` · ${e.funcao}`}</span>
                </Link>
                {e.status === "pendente" ? (
                  <div className="mt-2 flex flex-wrap gap-2">
                    <ActionForm action={responderEscalaAction} submit="Confirmar" className="space-y-0">
                      <input type="hidden" name="assignmentId" value={e.assignment_id} /><input type="hidden" name="status" value="confirmado" />
                    </ActionForm>
                    <ActionForm action={responderEscalaAction} submit="Recusar" danger className="flex items-center gap-2 space-y-0">
                      <input type="hidden" name="assignmentId" value={e.assignment_id} /><input type="hidden" name="status" value="recusado" />
                      <input name="motivo" placeholder="Motivo" aria-label="Motivo da recusa" maxLength={255} className={inputCls + " w-36"} />
                    </ActionForm>
                  </div>
                ) : <p className="mt-1"><Badge>confirmado</Badge></p>}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="Serviços e ministérios">
        {unidades.length === 0 ? <Empty>Nenhuma escala disponível para você.</Empty> : (
          <ul className="divide-y divide-borda">
            {unidades.map((u) => (
              <li key={u.id}><Link href={`/escalas/unidade/${u.id}`} className="flex min-h-12 items-center justify-between py-2"><span>{u.nome}</span><Badge>{TIPO_LABEL[u.tipo]}</Badge></Link></li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="Minha disponibilidade">
        <p className="mb-2 text-xs text-tinta/60">Informe os dias em que você não pode servir. A coordenação é avisada ao tentar escalar você.</p>
        {indisp.length > 0 && (
          <ul className="mb-3 divide-y divide-borda text-sm">
            {indisp.map((d) => (
              <li key={d.data} className="flex items-center justify-between gap-2 py-2">
                <span>{brDate(d.data)}{d.nota && ` — ${d.nota}`}</span>
                <ActionForm action={disponivelAction} submit="Remover" danger className="space-y-0"><input type="hidden" name="data" value={d.data} /></ActionForm>
              </li>
            ))}
          </ul>
        )}
        <ActionForm action={indisponivelAction} submit="Marcar indisponível">
          <Field label="Data"><input name="data" type="date" required className={inputCls} /></Field>
          <Field label="Observação (opcional)"><input name="nota" maxLength={160} className={inputCls} /></Field>
        </ActionForm>
      </Card>
    </div>
  );
}
