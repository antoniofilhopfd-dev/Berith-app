import { notFound } from "next/navigation";
import Link from "next/link";
import { requireUser } from "@/lib/auth/session";
import { canManageEvent, getEvent } from "@/lib/services/eventos";
import { NotFoundError } from "@/lib/services/errors";
import { utcToLocal } from "@/lib/time";
import { EventoForm } from "@/components/evento-form";
import { Card } from "@/components/ui";
import { editarEventoAction } from "../../actions";

export default async function EditarEvento({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) notFound();
  let ev;
  try { ev = await getEvent(user.id, id); } catch (e) { if (e instanceof NotFoundError) notFound(); throw e; }
  if (!(await canManageEvent(user.id, ev.unit_id, "editar")) || ev.cancelado_em) notFound();
  const i = utcToLocal(ev.inicio); const f = ev.fim ? utcToLocal(ev.fim) : null;
  return (
    <div className="space-y-4">
      <Link href={`/eventos/${id}`} className="inline-flex min-h-11 items-center text-sm text-verde">← Evento</Link>
      <h1 className="font-titulo text-2xl text-verde">Editar evento</h1>
      <Card>
        <EventoForm action={editarEventoAction} editando unidades={[]} comunidade={false}
          valores={{ id, titulo: ev.titulo, descricao: ev.descricao, local: ev.local, data: i.date, horaInicio: i.time, dataFim: f?.date, horaFim: f?.time,
            limite: ev.limite_participantes, lembreteMin: ev.lembrete_min, recorrencia: ev.recorrencia, recorrenciaAte: ev.recorrencia_ate ?? undefined }} />
      </Card>
    </div>
  );
}
