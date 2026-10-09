import { notFound } from "next/navigation";
import Link from "next/link";
import { requireUser } from "@/lib/auth/session";
import { listUnitShifts } from "@/lib/services/escalas";
import { can } from "@/lib/permissions";
import { query } from "@/lib/db";
import { NotFoundError } from "@/lib/services/errors";
import { Badge, Card, Empty } from "@/components/ui";
import { ActionForm, Field, inputCls } from "@/components/action-form";
import { formatTime } from "@/lib/format";
import { addDays, brDate, localToUtc, todayLocal, utcToLocal } from "@/lib/time";
import { criarEscalaAction } from "../../actions";
import type { RowDataPacket } from "mysql2/promise";

export default async function EscalasUnidade({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) notFound();
  let escalas;
  try { escalas = await listUnitShifts(user.id, id, localToUtc(todayLocal(), "00:00"), localToUtc(addDays(todayLocal(), 90), "00:00")); } catch (e) { if (e instanceof NotFoundError) notFound(); throw e; }
  const [u] = await query<RowDataPacket>("SELECT nome FROM org_units WHERE id = ?", [id]);
  const [criar, exportar] = await Promise.all([can(user.id, "escalas", "criar", id), can(user.id, "escalas", "exportar", id)]);
  return (
    <div className="space-y-4">
      <Link href="/escalas" className="inline-flex min-h-11 items-center text-sm text-vinho">← Escalas</Link>
      <h1 className="font-titulo text-2xl text-vinho">{u.nome}</h1>
      <Card title="Próximos 90 dias">
        {escalas.length === 0 ? <Empty>Nenhuma escala cadastrada.</Empty> : (
          <ul className="divide-y divide-borda">
            {escalas.map((e) => (
              <li key={e.id}><Link href={`/escalas/${e.id}`} className="flex min-h-14 items-center justify-between gap-2 py-2">
                <span><span className={`font-medium ${e.cancelado_em ? "line-through opacity-60" : ""}`}>{e.titulo}</span>
                  <span className="block text-sm text-tinta/70">{brDate(utcToLocal(e.inicio).date)} · {formatTime(e.inicio)} – {formatTime(e.fim)}</span></span>
                {e.cancelado_em && <Badge>cancelada</Badge>}
              </Link></li>
            ))}
          </ul>
        )}
        {exportar && <a href={`/api/escalas/exportar?unit=${id}`} className="mt-3 inline-flex min-h-11 items-center rounded-lg border border-vinho px-4 text-sm text-vinho">Exportar CSV (60 dias)</a>}
      </Card>
      {criar && (
        <Card title="Nova escala">
          <ActionForm action={criarEscalaAction} submit="Criar escala">
            <input type="hidden" name="unitId" value={id} />
            <Field label="Título"><input name="titulo" required minLength={3} maxLength={160} className={inputCls} placeholder="Ex.: Missa de domingo" /></Field>
            <div className="grid grid-cols-3 gap-2">
              <Field label="Data"><input name="data" type="date" required className={inputCls} /></Field>
              <Field label="Início"><input name="horaInicio" type="time" required className={inputCls} /></Field>
              <Field label="Término"><input name="horaFim" type="time" required className={inputCls} /></Field>
            </div>
            <Field label="Observação"><input name="observacao" maxLength={500} className={inputCls} /></Field>
          </ActionForm>
        </Card>
      )}
    </div>
  );
}
