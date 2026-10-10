import { requireUser } from "@/lib/auth/session";
import { contasECategorias } from "@/lib/services/financeiro";
import { can } from "@/lib/permissions";
import { Card } from "@/components/ui";
import { SubNav } from "@/components/fin-ui";
import { ActionForm, Field, inputCls } from "@/components/action-form";
import { categoriaAction, contaAction } from "../actions";

export default async function Cadastros() {
  const user = await requireUser();
  const [{ contas, categorias }, edita] = await Promise.all([contasECategorias(), can(user.id, "financeiro", "editar", null)]);
  return (
    <div className="space-y-4">
      <h1 className="font-titulo text-2xl text-verde">Contas e categorias</h1>
      <SubNav ativo="cadastros" />
      <Card title="Contas"><ul className="divide-y divide-borda text-sm">{contas.map((c) => <li key={c.id} className="py-2">{c.nome}</li>)}</ul>
        {edita && <ActionForm action={contaAction} submit="Adicionar conta" className="mt-3"><Field label="Nome da conta"><input name="nome" required minLength={2} maxLength={80} className={inputCls} /></Field></ActionForm>}</Card>
      {(["entrada", "saida"] as const).map((t) => <Card key={t} title={t === "entrada" ? "Categorias de entrada" : "Categorias de saída"}><ul className="divide-y divide-borda text-sm">{categorias.filter((c) => c.tipo === t).map((c) => <li key={c.id} className="py-2">{c.nome}</li>)}</ul></Card>)}
      {edita && <Card title="Nova categoria"><ActionForm action={categoriaAction} submit="Adicionar categoria">
        <Field label="Nome"><input name="nome" required minLength={2} maxLength={80} className={inputCls} /></Field>
        <Field label="Tipo"><select name="tipo" className={inputCls}><option value="entrada">Entrada</option><option value="saida">Saída</option></select></Field></ActionForm></Card>}
    </div>
  );
}
