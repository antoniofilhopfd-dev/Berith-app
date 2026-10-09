import { notFound } from "next/navigation";
import Link from "next/link";
import { requireUser } from "@/lib/auth/session";
import { sheet, corrections } from "@/lib/services/presencas";
import { getEvent } from "@/lib/services/eventos";
import { can } from "@/lib/permissions";
import { DomainError, NotFoundError } from "@/lib/services/errors";
import { ForbiddenError } from "@/lib/permissions";
import { brDate, isDate, todayLocal, utcToLocal } from "@/lib/time";
import { formatTime } from "@/lib/format";
import { Badge, Card, Empty } from "@/components/ui";
import { ActionForm, Field, inputCls } from "@/components/action-form";
import { adicionarParticipanteAction, marcarPresencaAction } from "../../presencas-actions";

export default async function Presencas({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ d?: string }> }) {
  const user = await requireUser();
  const id = Number((await params).id);
  const sp = await searchParams;
  if (!Number.isInteger(id) || id <= 0) notFound();
  let ev, data;
  try {
    ev = await getEvent(user.id, id);
    const date = sp.d && isDate(sp.d) ? sp.d : utcToLocal(ev.inicio).date;
    data = { date, ...(await sheet(user.id, id, date)) };
  } catch (e) {
    if (e instanceof NotFoundError || e instanceof ForbiddenError || e instanceof DomainError) notFound();
    throw e;
  }
  const [editar, correcoes] = await Promise.all([can(user.id, "presencas", "editar", ev.unit_id), corrections(user.id, id, data.date).catch(() => [])]);
  const hoje = todayLocal();
  return (
    <div className="space-y-4">
      <Link href={`/eventos/${id}?d=${data.date}`} className="inline-flex min-h-11 items-center text-sm text-vinho">← Evento</Link>
      <header>
        <h1 className="font-titulo text-2xl text-vinho">Chamada</h1>
        <p className="text-sm">{ev.titulo} · {brDate(data.date)}{data.date === hoje ? " (hoje)" : ""}</p>
        <p className="mt-1"><Badge>{data.presentes} presente(s) de {data.total}</Badge></p>
      </header>
      <Card title="Participantes">
        {data.linhas.length === 0 ? <Empty>Ninguém na lista.</Empty> : (
          <ul className="divide-y divide-borda">
            {data.linhas.map((l) => (
              <li key={l.user_id} className="py-3">
                <div className="flex items-center justify-between gap-2">
                  <span>{l.nome}{l.confirmou && <span className="ml-1 text-xs text-tinta/60">(confirmou)</span>}</span>
                  {l.presente != null && <Badge>{l.presente ? "presente" : "ausente"}</Badge>}
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {l.presente == null ? (
                    <>
                      <ActionForm action={marcarPresencaAction} submit="Presente" className="space-y-0"><input type="hidden" name="eventId" value={id} /><input type="hidden" name="date" value={data.date} /><input type="hidden" name="userId" value={l.user_id} /><input type="hidden" name="presente" value="1" /></ActionForm>
                      <ActionForm action={marcarPresencaAction} submit="Ausente" danger className="space-y-0"><input type="hidden" name="eventId" value={id} /><input type="hidden" name="date" value={data.date} /><input type="hidden" name="userId" value={l.user_id} /><input type="hidden" name="presente" value="0" /></ActionForm>
                    </>
                  ) : editar && (
                    <ActionForm action={marcarPresencaAction} submit={`Corrigir para ${l.presente ? "ausente" : "presente"}`} className="flex flex-wrap items-center gap-2 space-y-0">
                      <input type="hidden" name="eventId" value={id} /><input type="hidden" name="date" value={data.date} /><input type="hidden" name="userId" value={l.user_id} /><input type="hidden" name="presente" value={l.presente ? "0" : "1"} />
                      <input name="motivo" required minLength={3} maxLength={255} placeholder="Motivo da correção" aria-label="Motivo da correção" className={inputCls + " w-48"} />
                    </ActionForm>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Card title="Adicionar participante">
        <ActionForm action={adicionarParticipanteAction} submit="Adicionar presente">
          <input type="hidden" name="eventId" value={id} /><input type="hidden" name="date" value={data.date} />
          <Field label="E-mail"><input name="email" type="email" required className={inputCls} /></Field>
        </ActionForm>
        <Link href={`/eventos/${id}/qr?d=${data.date}`} className="mt-3 inline-flex min-h-11 items-center rounded-lg border border-vinho px-4 text-sm text-vinho">Mostrar QR Code de check-in</Link>
      </Card>
      {editar && correcoes.length > 0 && (
        <Card title="Correções registradas">
          <ul className="divide-y divide-borda text-sm">
            {correcoes.map((c, i) => <li key={i} className="py-2"><strong>{c.nome}</strong>: {c.antes ? "presente" : "ausente"} → {c.depois ? "presente" : "ausente"}
              <span className="block text-xs text-tinta/60">por {c.por} · {formatTime(c.criado_em)} · {c.motivo}</span></li>)}
          </ul>
        </Card>
      )}
    </div>
  );
}
