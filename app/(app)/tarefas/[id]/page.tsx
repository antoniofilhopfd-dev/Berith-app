import { notFound } from "next/navigation";
import Link from "next/link";
import { requireUser } from "@/lib/auth/session";
import { getTask } from "@/lib/services/tarefas";
import { NotFoundError } from "@/lib/services/errors";
import { Badge, Card, Empty } from "@/components/ui";
import { ActionForm, Field, inputCls } from "@/components/action-form";
import { brDate, utcToLocal } from "@/lib/time";
import { formatTime } from "@/lib/format";
import { comentarAction, editarTarefaAction, statusTarefaAction } from "../actions";
import { STATUS_LABEL } from "@/lib/format";

export default async function TarefaDetalhe({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) notFound();
  let d;
  try { d = await getTask(user.id, id); } catch (e) { if (e instanceof NotFoundError) notFound(); throw e; }
  const { tarefa: t, comentarios, historico, gerencia, souResponsavel } = d;
  const opcoes = (gerencia ? ["aberta", "em_andamento", "concluida", "cancelada"] : ["aberta", "em_andamento", "concluida"]).filter((s) => s !== t.status);
  return (
    <div className="space-y-4">
      <Link href="/tarefas" className="inline-flex min-h-11 items-center text-sm text-verde">← Tarefas</Link>
      <header>
        <div className="flex flex-wrap gap-1"><Badge>{STATUS_LABEL[t.status]}</Badge><Badge>{t.unit_nome}</Badge><Badge>prioridade {t.prioridade}</Badge>{Number(t.atrasada) === 1 && <Badge>atrasada</Badge>}{t.meeting_id && <Link href={`/reunioes/${t.meeting_id}`}><Badge>da reunião</Badge></Link>}</div>
        <h1 className="mt-1 font-titulo text-2xl text-verde">{t.titulo}</h1>
        <p className="text-sm text-tinta/70">{t.responsavel_nome ? `Responsável: ${t.responsavel_nome}` : "Sem responsável"}{t.prazo && ` · prazo ${brDate(t.prazo)}`}</p>
        {t.descricao && <p className="mt-2 whitespace-pre-line text-sm">{t.descricao}</p>}
      </header>
      {(gerencia || souResponsavel) && opcoes.length > 0 && (
        <Card title="Andamento">
          <div className="flex flex-wrap gap-2">
            {opcoes.map((s) => (
              <ActionForm key={s} action={statusTarefaAction} submit={`Marcar ${STATUS_LABEL[s].toLowerCase()}`} danger={s === "cancelada"} className="space-y-0">
                <input type="hidden" name="id" value={id} /><input type="hidden" name="status" value={s} />
              </ActionForm>
            ))}
          </div>
        </Card>
      )}
      <Card title="Comentários">
        {comentarios.length === 0 ? <Empty>Nenhum comentário.</Empty> : <ul className="mb-3 divide-y divide-borda text-sm">{comentarios.map((c, i) => <li key={i} className="py-2"><strong>{c.nome}</strong> <span className="text-xs text-tinta/60">{brDate(utcToLocal(c.criado_em).date)} {formatTime(c.criado_em)}</span><p className="whitespace-pre-line">{c.texto}</p></li>)}</ul>}
        <ActionForm action={comentarAction} submit="Comentar">
          <input type="hidden" name="id" value={id} />
          <Field label="Novo comentário"><textarea name="texto" required rows={2} maxLength={2000} className={inputCls + " resize-none py-2"} /></Field>
        </ActionForm>
        <p className="mt-2 text-xs text-tinta/60">Anexos serão habilitados com o armazenamento seguro de arquivos (etapa 06).</p>
      </Card>
      {gerencia && (
        <Card title="Editar tarefa">
          <ActionForm action={editarTarefaAction} submit="Salvar" resetOnOk={false}>
            <input type="hidden" name="id" value={id} />
            <Field label="Título"><input name="titulo" defaultValue={t.titulo} required minLength={3} className={inputCls} /></Field>
            <Field label="Descrição"><textarea name="descricao" defaultValue={t.descricao ?? ""} rows={2} className={inputCls + " resize-none py-2"} /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Prazo"><input name="prazo" type="date" defaultValue={t.prazo ?? ""} className={inputCls} /></Field>
              <Field label="Prioridade"><select name="prioridade" defaultValue={t.prioridade} className={inputCls}><option value="baixa">Baixa</option><option value="media">Média</option><option value="alta">Alta</option></select></Field>
            </div>
            <Field label="Novo responsável (e-mail, opcional)"><input name="responsavelEmail" type="email" className={inputCls} /></Field>
          </ActionForm>
        </Card>
      )}
      <Card title="Histórico">
        <ul className="divide-y divide-borda text-sm">{historico.map((h, i) => <li key={i} className="py-2"><strong>{h.acao}</strong>{h.detalhes && ` — ${h.detalhes}`} <span className="text-xs text-tinta/60">por {h.nome ?? "—"} · {brDate(utcToLocal(h.criado_em).date)}</span></li>)}</ul>
      </Card>
    </div>
  );
}
