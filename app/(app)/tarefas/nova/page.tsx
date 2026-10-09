import { notFound } from "next/navigation";
import Link from "next/link";
import { requireUser } from "@/lib/auth/session";
import { unitsFor } from "@/lib/services/alvos";
import { Card } from "@/components/ui";
import { ActionForm, Field, inputCls } from "@/components/action-form";
import { TIPO_LABEL } from "@/lib/format";
import { criarTarefaAction } from "../actions";

export default async function NovaTarefa() {
  const user = await requireUser();
  const unidades = await unitsFor(user.id, "tarefas", "criar");
  if (unidades.length === 0) notFound();
  return (
    <div className="space-y-4">
      <Link href="/tarefas" className="inline-flex min-h-11 items-center text-sm text-verde">← Tarefas</Link>
      <h1 className="font-titulo text-2xl text-verde">Nova tarefa</h1>
      <Card>
        <ActionForm action={criarTarefaAction} submit="Criar tarefa">
          <Field label="Estrutura"><select name="unitId" className={inputCls}>{unidades.map((u) => <option key={u.id} value={u.id}>{TIPO_LABEL[u.tipo]}: {u.nome}</option>)}</select></Field>
          <Field label="Título"><input name="titulo" required minLength={3} maxLength={160} className={inputCls} /></Field>
          <Field label="Descrição"><textarea name="descricao" rows={3} maxLength={4000} className={inputCls + " resize-none py-2"} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Prazo"><input name="prazo" type="date" className={inputCls} /></Field>
            <Field label="Prioridade"><select name="prioridade" defaultValue="media" className={inputCls}><option value="baixa">Baixa</option><option value="media">Média</option><option value="alta">Alta</option></select></Field>
          </div>
          <Field label="Responsável (e-mail do integrante)"><input name="responsavelEmail" type="email" className={inputCls} /></Field>
        </ActionForm>
      </Card>
    </div>
  );
}
