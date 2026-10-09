import Link from "next/link";
import { requireUser } from "@/lib/auth/session";
import { listUnits } from "@/lib/services/estruturas";
import { can } from "@/lib/permissions";
import { TIPO_LABEL } from "@/lib/format";
import { Badge, Card, Empty } from "@/components/ui";
import { ActionForm, Field, inputCls } from "@/components/action-form";
import { criarEstruturaAction } from "./actions";
import { TIPOS } from "@/lib/validation/estruturas";

export default async function Estruturas() {
  const user = await requireUser();
  const units = await listUnits(user.id);
  const podeCriarRaiz = await can(user.id, "estruturas", "criar");
  const grupos = TIPOS.map((t) => ({ tipo: t, itens: units.filter((u) => u.tipo === t) })).filter((g) => g.itens.length);
  const pais = units.filter((u) => u.ativo);
  return (
    <div className="space-y-4">
      <h1 className="font-titulo text-2xl text-vinho">Estruturas</h1>
      {grupos.length === 0 && <Card><Empty>Nenhuma estrutura cadastrada ainda.</Empty></Card>}
      {grupos.map((g) => (
        <Card key={g.tipo} title={TIPO_LABEL[g.tipo] + "s"}>
          <ul className="divide-y divide-borda">
            {g.itens.map((u) => (
              <li key={u.id}>
                <Link href={`/estruturas/${u.id}`} className="flex min-h-12 items-center justify-between gap-2 py-2">
                  <span>
                    <span className={u.ativo ? "" : "text-tinta/50 line-through"}>{u.nome}</span>
                    {u.parent_nome && <span className="block text-xs text-tinta/60">em {u.parent_nome}</span>}
                  </span>
                  <Badge>{u.integrantes} integrante(s)</Badge>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      ))}
      {(podeCriarRaiz || pais.length > 0) && (
        <Card title="Nova estrutura">
          <ActionForm action={criarEstruturaAction} submit="Criar estrutura">
            <Field label="Tipo">
              <select name="tipo" className={inputCls} defaultValue="ministerio">
                {TIPOS.map((t) => <option key={t} value={t}>{TIPO_LABEL[t]}</option>)}
              </select>
            </Field>
            <Field label="Nome"><input name="nome" required minLength={2} className={inputCls} /></Field>
            <Field label="Subordinada a">
              <select name="parentId" className={inputCls} defaultValue="">
                {podeCriarRaiz && <option value="">(nenhuma — nível principal)</option>}
                {pais.map((u) => <option key={u.id} value={u.id}>{TIPO_LABEL[u.tipo]}: {u.nome}</option>)}
              </select>
            </Field>
            <Field label="Descrição (opcional)"><textarea name="descricao" rows={2} className={inputCls + " py-2"} /></Field>
          </ActionForm>
        </Card>
      )}
    </div>
  );
}
