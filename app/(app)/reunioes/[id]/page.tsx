import { notFound } from "next/navigation";
import Link from "next/link";
import { requireUser } from "@/lib/auth/session";
import { getMeeting } from "@/lib/services/reunioes";
import { NotFoundError } from "@/lib/services/errors";
import { Badge, Card, Empty } from "@/components/ui";
import { ActionForm, Field, inputCls } from "@/components/action-form";
import { formatTime } from "@/lib/format";
import { brDate, utcToLocal } from "@/lib/time";
import { decisaoAction, salvarAtaAction } from "../actions";

export default async function ReuniaoDetalhe({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) notFound();
  let d;
  try { d = await getMeeting(user.id, id); } catch (e) { if (e instanceof NotFoundError) notFound(); throw e; }
  const { reuniao: m, participantes, decisoes, gerencia } = d;
  return (
    <div className="space-y-4">
      <Link href="/reunioes" className="inline-flex min-h-11 items-center text-sm text-vinho">← Reuniões</Link>
      <header>
        <div className="flex gap-1"><Badge>{m.unit_nome}</Badge><Badge>{m.status}</Badge></div>
        <h1 className="mt-1 font-titulo text-2xl text-vinho">{m.titulo}</h1>
        <p className="text-sm">{brDate(utcToLocal(m.inicio).date)} · {formatTime(m.inicio)}{m.fim && ` – ${formatTime(m.fim)}`}{m.local && ` · ${m.local}`}</p>
      </header>
      <Card title="Pauta">{m.pauta ? <p className="whitespace-pre-line text-sm">{m.pauta}</p> : <Empty>Sem pauta.</Empty>}</Card>
      <Card title={`Participantes (${participantes.length})`}><p className="text-sm">{participantes.map((p) => p.nome).join(", ") || "—"}</p></Card>
      <Card title="Ata">{m.ata ? <p className="whitespace-pre-line text-sm">{m.ata}</p> : <Empty>A ata ainda não foi registrada.</Empty>}</Card>
      <Card title="Decisões">
        {decisoes.length === 0 ? <Empty>Nenhuma decisão registrada.</Empty> : (
          <ul className="divide-y divide-borda text-sm">
            {decisoes.map((x) => (
              <li key={x.id} className="py-2">{x.texto}
                {x.task_id && <Link href={`/tarefas/${x.task_id}`} className="ml-2 inline-flex min-h-8 items-center"><Badge>tarefa: {x.task_status}</Badge></Link>}
              </li>
            ))}
          </ul>
        )}
      </Card>
      {gerencia && (
        <>
          <Card title="Registrar ata">
            <ActionForm action={salvarAtaAction} submit="Salvar ata" resetOnOk={false}>
              <input type="hidden" name="id" value={id} />
              <Field label="Situação"><select name="status" defaultValue={m.status === "agendada" ? "realizada" : m.status} className={inputCls}><option value="agendada">Agendada</option><option value="realizada">Realizada</option><option value="cancelada">Cancelada</option></select></Field>
              <Field label="Ata"><textarea name="ata" defaultValue={m.ata ?? ""} rows={6} maxLength={20000} className={inputCls + " resize-none py-2"} /></Field>
            </ActionForm>
          </Card>
          <Card title="Nova decisão">
            <ActionForm action={decisaoAction} submit="Registrar decisão">
              <input type="hidden" name="meetingId" value={id} />
              <Field label="Decisão"><textarea name="texto" required minLength={3} rows={2} maxLength={1000} className={inputCls + " resize-none py-2"} /></Field>
              <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" name="gerarTarefa" className="h-5 w-5" /> Gerar tarefa a partir desta decisão</label>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Responsável (e-mail)"><input name="responsavelEmail" type="email" className={inputCls} /></Field>
                <Field label="Prazo"><input name="prazo" type="date" className={inputCls} /></Field>
              </div>
            </ActionForm>
          </Card>
        </>
      )}
    </div>
  );
}
