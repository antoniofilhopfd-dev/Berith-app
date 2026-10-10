import { ActionForm, Field, inputCls } from "./action-form";
import type { FormAction } from "@/lib/auth/guard";

type V = { id?: number; contaId?: number; categoriaId?: number; tipo?: string; valor?: string; data?: string; descricao?: string };
export function LancamentoForm({ action, contas, categorias, valores = {}, editando = false, hoje }: {
  action: FormAction; contas: { id: number; nome: string }[]; categorias: { id: number; nome: string; tipo: string }[]; valores?: V; editando?: boolean; hoje: string;
}) {
  return (
    <ActionForm action={action} submit={editando ? "Salvar e reenviar para aprovação" : "Registrar lançamento"} resetOnOk={false}>
      {valores.id && <input type="hidden" name="id" value={valores.id} />}
      <Field label="Tipo"><select name="tipo" defaultValue={valores.tipo ?? "entrada"} className={inputCls}><option value="entrada">Entrada</option><option value="saida">Saída</option></select></Field>
      <Field label="Categoria (deve corresponder ao tipo)">
        <select name="categoriaId" defaultValue={valores.categoriaId} className={inputCls}>
          <optgroup label="Entradas">{categorias.filter((c) => c.tipo === "entrada").map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}</optgroup>
          <optgroup label="Saídas">{categorias.filter((c) => c.tipo === "saida").map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}</optgroup>
        </select>
      </Field>
      <Field label="Conta"><select name="contaId" defaultValue={valores.contaId} className={inputCls}>{contas.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}</select></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Valor (R$)"><input name="valor" required inputMode="decimal" placeholder="0,00" defaultValue={valores.valor} className={inputCls} autoComplete="off" /></Field>
        <Field label="Data"><input name="data" type="date" required max={hoje} defaultValue={valores.data ?? hoje} className={inputCls} /></Field>
      </div>
      <Field label="Descrição"><input name="descricao" required minLength={3} maxLength={255} defaultValue={valores.descricao} className={inputCls} /></Field>
      {!editando && (
        <fieldset className="space-y-3 rounded-lg border border-borda p-3"><legend className="px-1 text-sm font-medium">Doador (somente entradas, opcional)</legend>
          <Field label="E-mail de um membro"><input name="doadorEmail" type="email" className={inputCls} /></Field>
          <Field label="ou nome (não membro)"><input name="doadorNome" maxLength={150} className={inputCls} /></Field>
          <p className="text-xs text-tinta/60">Esta informação só aparece para quem tem autorização específica para contribuições individuais.</p>
        </fieldset>
      )}
      <p className="text-xs text-tinta/60">O lançamento fica pendente até ser aprovado por outra pessoa. Valores aprovados não são editados: correções são feitas por estorno.</p>
    </ActionForm>
  );
}
