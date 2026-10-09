import { notFound } from "next/navigation";
import Link from "next/link";
import { requireUser } from "@/lib/auth/session";
import { unitsFor } from "@/lib/services/alvos";
import { Card } from "@/components/ui";
import { ActionForm, Field, inputCls } from "@/components/action-form";
import { TIPO_LABEL } from "@/lib/format";
import { criarReuniaoAction } from "../actions";

export default async function NovaReuniao() {
  const user = await requireUser();
  const unidades = await unitsFor(user.id, "reunioes", "criar");
  if (unidades.length === 0) notFound();
  return (
    <div className="space-y-4">
      <Link href="/reunioes" className="inline-flex min-h-11 items-center text-sm text-verde">← Reuniões</Link>
      <h1 className="font-titulo text-2xl text-verde">Nova reunião</h1>
      <Card>
        <ActionForm action={criarReuniaoAction} submit="Agendar reunião">
          <Field label="Estrutura"><select name="unitId" className={inputCls}>{unidades.map((u) => <option key={u.id} value={u.id}>{TIPO_LABEL[u.tipo]}: {u.nome}</option>)}</select></Field>
          <Field label="Título"><input name="titulo" required minLength={3} maxLength={160} className={inputCls} /></Field>
          <div className="grid grid-cols-3 gap-2">
            <Field label="Data"><input name="data" type="date" required className={inputCls} /></Field>
            <Field label="Início"><input name="horaInicio" type="time" required className={inputCls} /></Field>
            <Field label="Término"><input name="horaFim" type="time" className={inputCls} /></Field>
          </div>
          <Field label="Local"><input name="local" maxLength={160} className={inputCls} /></Field>
          <Field label="Pauta"><textarea name="pauta" rows={4} maxLength={4000} className={inputCls + " resize-none py-2"} placeholder={"1. Abertura e oração\n2. ..."} /></Field>
          <p className="text-xs text-tinta/60">Os integrantes ativos da estrutura são convidados automaticamente.</p>
        </ActionForm>
      </Card>
    </div>
  );
}
