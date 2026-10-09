import { notFound } from "next/navigation";
import Link from "next/link";
import { requireUser } from "@/lib/auth/session";
import { getComunicado, isScheduled, readStats } from "@/lib/services/comunicados";
import { can } from "@/lib/permissions";
import { NotFoundError } from "@/lib/services/errors";
import { formatDate, formatTime } from "@/lib/format";
import { Badge, Card } from "@/components/ui";
import { ActionForm } from "@/components/action-form";
import { confirmarLeituraAction, excluirComunicadoAction } from "../actions";
import { Anexos } from "@/components/anexos";

export default async function ComunicadoDetalhe({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) notFound();
  let a;
  try { a = await getComunicado(user.id, id); } catch (e) { if (e instanceof NotFoundError) notFound(); throw e; }
  const [gestor, excluir] = await Promise.all([can(user.id, "comunicados", "editar", a.unit_id), can(user.id, "comunicados", "excluir", a.unit_id)]);
  const stats = gestor ? await readStats(user.id, id) : null;
  const agendado = isScheduled(a);
  return (
    <div className="space-y-4">
      <Link href="/comunicados" className="inline-flex min-h-11 items-center text-sm text-verde">← Comunicados</Link>
      <header>
        <div className="flex flex-wrap gap-1">
          {a.prioridade !== "normal" && <Badge>{a.prioridade}</Badge>}<Badge>{a.unit_nome ?? "Toda a comunidade"}</Badge>
          {agendado && <Badge>agendado</Badge>}
        </div>
        <h1 className="mt-1 font-titulo text-2xl text-verde">{a.titulo}</h1>
        <p className="text-xs text-tinta/60">{a.autor} · {formatDate(a.publicar_em)} {formatTime(a.publicar_em)}{a.expira_em && ` · expira em ${formatDate(a.expira_em)}`}</p>
        <p className="mt-3 whitespace-pre-line text-sm">{a.corpo}</p>
      </header>
      <Anexos actor={user.id} tipo="comunicado" ctxId={id} />
      {!agendado && (
        <Card>
          {a.lido_em ? <p className="text-sm text-green-800">✓ Você confirmou a leitura em {formatDate(a.lido_em)}.</p> : (
            <ActionForm action={confirmarLeituraAction} submit="Confirmar leitura"><input type="hidden" name="id" value={id} /></ActionForm>
          )}
        </Card>
      )}
      {stats && (
        <Card title={`Leituras: ${stats.lidos} de ${stats.total}`}>
          {stats.pendentes.length > 0 ? (
            <><p className="mb-1 text-sm text-tinta/70">Ainda não leram:</p><p className="text-sm">{stats.pendentes.join(", ")}</p></>
          ) : <p className="text-sm text-green-800">Todos os destinatários confirmaram a leitura.</p>}
        </Card>
      )}
      {excluir && (
        <ActionForm action={excluirComunicadoAction} submit="Excluir comunicado" danger><input type="hidden" name="id" value={id} /></ActionForm>
      )}
    </div>
  );
}
