import { ActionForm, Field, inputCls } from "./action-form";
import type { FormAction } from "@/lib/auth/guard";
import { TIPO_LABEL } from "@/lib/format";

type Valores = {
  id?: number; titulo?: string; descricao?: string | null; local?: string | null; data?: string; horaInicio?: string; dataFim?: string; horaFim?: string;
  limite?: number | null; lembreteMin?: number | null; recorrencia?: string; recorrenciaAte?: string; unitId?: number | null; responsavel?: string | null;
};

export function EventoForm({
  action, valores = {}, unidades, comunidade, editando = false,
}: {
  action: FormAction; valores?: Valores; unidades: { id: number; nome: string; tipo: string }[]; comunidade: boolean; editando?: boolean;
}) {
  return (
    <ActionForm action={action} submit={editando ? "Salvar alterações" : "Criar evento"} resetOnOk={false}>
      {valores.id && <input type="hidden" name="id" value={valores.id} />}
      <Field label="Título"><input name="titulo" required minLength={3} maxLength={160} defaultValue={valores.titulo} className={inputCls} /></Field>
      {!editando && (
        <Field label="Quem pode ver">
          <select name="unitId" className={inputCls} defaultValue={valores.unitId ?? (comunidade ? "" : unidades[0]?.id)}>
            {comunidade && <option value="">Toda a comunidade</option>}
            {unidades.map((u) => <option key={u.id} value={u.id}>{TIPO_LABEL[u.tipo]}: {u.nome}</option>)}
          </select>
        </Field>
      )}
      <div className="grid grid-cols-2 gap-3">
        <Field label="Data"><input name="data" type="date" required defaultValue={valores.data} className={inputCls} /></Field>
        <Field label="Início (24h)"><input name="horaInicio" type="time" required defaultValue={valores.horaInicio} className={inputCls} /></Field>
        <Field label="Término — data"><input name="dataFim" type="date" defaultValue={valores.dataFim} className={inputCls} /></Field>
        <Field label="Término (24h)"><input name="horaFim" type="time" defaultValue={valores.horaFim} className={inputCls} /></Field>
      </div>
      <Field label="Local"><input name="local" maxLength={160} defaultValue={valores.local ?? ""} className={inputCls} /></Field>
      <Field label="Descrição"><textarea name="descricao" rows={3} maxLength={4000} defaultValue={valores.descricao ?? ""} className={inputCls + " resize-none py-2"} /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Limite de vagas"><input name="limite" type="number" min={1} defaultValue={valores.limite ?? ""} placeholder="Sem limite" className={inputCls} /></Field>
        <Field label="Lembrete (min antes)"><input name="lembreteMin" type="number" min={1} defaultValue={valores.lembreteMin ?? ""} placeholder="Nenhum" className={inputCls} /></Field>
        <Field label="Repetir">
          <select name="recorrencia" defaultValue={valores.recorrencia ?? "nenhuma"} className={inputCls}>
            <option value="nenhuma">Não repete</option><option value="semanal">Toda semana</option><option value="mensal">Todo mês</option>
          </select>
        </Field>
        <Field label="Repetir até"><input name="recorrenciaAte" type="date" defaultValue={valores.recorrenciaAte} className={inputCls} /></Field>
      </div>
      <Field label="Responsável (e-mail, opcional)"><input name="responsavelEmail" type="email" defaultValue={valores.responsavel ?? ""} className={inputCls} placeholder="Padrão: você" /></Field>
    </ActionForm>
  );
}
