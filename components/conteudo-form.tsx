import { ActionForm, Field, inputCls } from "./action-form";
import type { FormAction } from "@/lib/auth/guard";
import { CATEGORIAS, CATEGORIA_ROTULO } from "@/lib/validation/formacao";
import { TIPO_LABEL } from "@/lib/format";

export function ConteudoForm({ action, unidades, comunidade, valores = {}, editando = false }: {
  action: FormAction; unidades: { id: number; nome: string; tipo: string }[]; comunidade: boolean; editando?: boolean;
  valores?: { id?: number; categoria?: string; titulo?: string; resumo?: string | null; corpo?: string | null; unitId?: number | null; fonte_nome?: string; fonte_url?: string | null; direitos?: string | null; publicado?: number };
}) {
  return (
    <ActionForm action={action} submit={editando ? "Salvar alterações" : "Criar conteúdo"} resetOnOk={false}>
      {valores.id && <input type="hidden" name="id" value={valores.id} />}
      <Field label="Categoria"><select name="categoria" defaultValue={valores.categoria ?? "formacao"} className={inputCls}>{CATEGORIAS.map((c) => <option key={c} value={c}>{CATEGORIA_ROTULO[c]}</option>)}</select></Field>
      <Field label="Título"><input name="titulo" required minLength={3} maxLength={200} defaultValue={valores.titulo} className={inputCls} /></Field>
      <Field label="Resumo (opcional)"><input name="resumo" maxLength={500} defaultValue={valores.resumo ?? ""} className={inputCls} /></Field>
      <Field label="Texto"><textarea name="corpo" rows={8} maxLength={100000} defaultValue={valores.corpo ?? ""} className={inputCls + " py-2"} /></Field>
      {editando ? <input type="hidden" name="unitId" value={valores.unitId ?? ""} /> : (
        <Field label="Quem pode ver">
          <select name="unitId" className={inputCls} defaultValue={comunidade ? "" : unidades[0]?.id}>
            {comunidade && <option value="">Toda a comunidade</option>}
            {unidades.map((u) => <option key={u.id} value={u.id}>Somente: {TIPO_LABEL[u.tipo]} {u.nome}</option>)}
          </select>
        </Field>
      )}
      <Field label="Fonte (obrigatória)"><input name="fonteNome" required maxLength={160} defaultValue={valores.fonte_nome} className={inputCls} placeholder="Autor, obra ou site de origem" /></Field>
      <Field label="Link da fonte (opcional)"><input name="fonteUrl" type="url" defaultValue={valores.fonte_url ?? ""} className={inputCls} /></Field>
      <Field label="Direitos / autorização (opcional)"><input name="direitos" maxLength={300} defaultValue={valores.direitos ?? ""} className={inputCls} /></Field>
      <Field label="Situação"><select name="publicado" defaultValue={valores.publicado === 0 ? "0" : "1"} className={inputCls}><option value="1">Publicado</option><option value="0">Rascunho (só quem edita vê)</option></select></Field>
      <p className="text-xs text-tinta/60">Respeite os direitos autorais: cadastre só o que a comunidade pode reproduzir e informe sempre a origem. PDF e áudio são anexados depois de salvar.</p>
    </ActionForm>
  );
}
