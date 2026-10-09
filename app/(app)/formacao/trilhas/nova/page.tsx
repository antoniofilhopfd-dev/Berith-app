import { notFound } from "next/navigation";
import Link from "next/link";
import { requireUser } from "@/lib/auth/session";
import { unitsFor } from "@/lib/services/alvos";
import { listarConteudos, podeCriarConteudo } from "@/lib/services/formacao";
import { ActionForm, Field, inputCls } from "@/components/action-form";
import { Card } from "@/components/ui";
import { TIPO_LABEL } from "@/lib/format";
import { criarTrilhaAction } from "../../actions";

export default async function NovaTrilha() {
  const user = await requireUser();
  const [unidades, comunidade, { itens }] = await Promise.all([unitsFor(user.id, "conteudos", "criar"), podeCriarConteudo(user.id, null), listarConteudos(user.id)]);
  if (!comunidade && unidades.length === 0) notFound();
  return (
    <div className="space-y-4">
      <Link href="/formacao" className="inline-flex min-h-11 items-center text-sm text-verde">← Orações e formação</Link>
      <h1 className="font-titulo text-2xl text-verde">Nova trilha formativa</h1>
      <Card>
        <ActionForm action={criarTrilhaAction} submit="Criar trilha">
          <Field label="Título"><input name="titulo" required minLength={3} maxLength={160} className={inputCls} /></Field>
          <Field label="Descrição (opcional)"><input name="descricao" maxLength={500} className={inputCls} /></Field>
          <Field label="Quem pode ver">
            <select name="unitId" className={inputCls} defaultValue={comunidade ? "" : unidades[0]?.id}>
              {comunidade && <option value="">Toda a comunidade</option>}
              {unidades.map((u) => <option key={u.id} value={u.id}>Somente: {TIPO_LABEL[u.tipo]} {u.nome}</option>)}
            </select>
          </Field>
          <fieldset className="space-y-1"><legend className="mb-1 text-sm font-medium">Conteúdos (na ordem da lista)</legend>
            {itens.map((c) => <label key={c.id} className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" name="conteudo" value={c.id} className="h-5 w-5" /> {c.titulo} <span className="text-xs text-tinta/50">({c.unit_nome ?? "comunidade"})</span></label>)}
          </fieldset>
          <p className="text-xs text-tinta/60">A trilha só aceita conteúdos da mesma estrutura ou abertos à comunidade.</p>
        </ActionForm>
      </Card>
    </div>
  );
}
