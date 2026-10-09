import { notFound } from "next/navigation";
import Link from "next/link";
import { requireUser } from "@/lib/auth/session";
import { getShift } from "@/lib/services/escalas";
import { can } from "@/lib/permissions";
import { NotFoundError } from "@/lib/services/errors";
import { Badge, Card, Empty } from "@/components/ui";
import { ActionForm, Field, inputCls } from "@/components/action-form";
import { formatTime } from "@/lib/format";
import { brDate, utcToLocal } from "@/lib/time";
import { cancelarEscalaAction, escalarAction, removerEscalacaoAction, responderEscalaAction, substituirAction } from "../actions";

export default async function EscalaDetalhe({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) notFound();
  let d;
  try { d = await getShift(user.id, id); } catch (e) { if (e instanceof NotFoundError) notFound(); throw e; }
  const { escala, atribuicoes } = d;
  const [editar, excluir] = await Promise.all([can(user.id, "escalas", "editar", escala.unit_id), can(user.id, "escalas", "excluir", escala.unit_id)]);
  const ativas = atribuicoes.filter((a) => a.status !== "substituido");
  return (
    <div className="space-y-4">
      <Link href={`/escalas/unidade/${escala.unit_id}`} className="inline-flex min-h-11 items-center text-sm text-vinho">← {escala.unit_nome}</Link>
      <header>
        <Badge>{escala.unit_nome}</Badge>{escala.cancelado_em && <> <Badge>cancelada</Badge></>}
        <h1 className="mt-1 font-titulo text-2xl text-vinho">{escala.titulo}</h1>
        <p className="text-sm">{brDate(utcToLocal(escala.inicio).date)} · {formatTime(escala.inicio)} – {formatTime(escala.fim)}</p>
        {escala.observacao && <p className="mt-1 text-sm text-tinta/70">{escala.observacao}</p>}
      </header>
      <Card title={`Escalados (${ativas.length})`}>
        {ativas.length === 0 ? <Empty>Ninguém escalado ainda.</Empty> : (
          <ul className="divide-y divide-borda">
            {ativas.map((a) => (
              <li key={a.id} className="py-3 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span><strong>{a.nome}</strong>{a.funcao && <span className="text-tinta/70"> · {a.funcao}</span>}</span>
                  <Badge>{a.status}</Badge>
                </div>
                {a.motivo && <p className="text-xs text-tinta/60">Motivo da recusa: {a.motivo}</p>}
                {a.user_id === user.id && a.status === "pendente" && !escala.cancelado_em && (
                  <div className="mt-2 flex gap-2">
                    <ActionForm action={responderEscalaAction} submit="Confirmar" className="space-y-0"><input type="hidden" name="assignmentId" value={a.id} /><input type="hidden" name="status" value="confirmado" /></ActionForm>
                    <ActionForm action={responderEscalaAction} submit="Recusar" danger className="space-y-0"><input type="hidden" name="assignmentId" value={a.id} /><input type="hidden" name="status" value="recusado" /></ActionForm>
                  </div>
                )}
                {editar && !escala.cancelado_em && (
                  <details className="mt-2">
                    <summary className="flex min-h-11 cursor-pointer items-center text-vinho">Substituir ou remover</summary>
                    <ActionForm action={substituirAction} submit="Substituir por" className="mt-2">
                      <input type="hidden" name="assignmentId" value={a.id} />
                      <Field label="E-mail do substituto"><input name="email" type="email" required className={inputCls} /></Field>
                      <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" name="forcar" className="h-5 w-5" /> Escalar mesmo com indisponibilidade informada</label>
                    </ActionForm>
                    <ActionForm action={removerEscalacaoAction} submit="Remover da escala" danger className="mt-2"><input type="hidden" name="assignmentId" value={a.id} /></ActionForm>
                  </details>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
      {editar && !escala.cancelado_em && (
        <Card title="Escalar pessoa">
          <ActionForm action={escalarAction} submit="Escalar">
            <input type="hidden" name="shiftId" value={id} />
            <Field label="E-mail do integrante"><input name="email" type="email" required className={inputCls} /></Field>
            <Field label="Função (opcional)"><input name="funcao" maxLength={80} className={inputCls} placeholder="Ex.: Leitor, Porta, Som" /></Field>
            <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" name="forcar" className="h-5 w-5" /> Escalar mesmo com indisponibilidade informada</label>
            <p className="text-xs text-tinta/60">O sistema impede conflitos de horário com outras escalas da pessoa.</p>
          </ActionForm>
        </Card>
      )}
      {excluir && !escala.cancelado_em && <ActionForm action={cancelarEscalaAction} submit="Cancelar escala" danger><input type="hidden" name="id" value={id} /></ActionForm>}
    </div>
  );
}
