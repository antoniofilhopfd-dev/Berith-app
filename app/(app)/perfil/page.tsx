import { requireUser } from "@/lib/auth/session";
import { getPerson } from "@/lib/services/membros";
import { minhasContribuicoes } from "@/lib/services/financeiro";
import { formatBRL } from "@/lib/dinheiro";
import { Card, Empty } from "@/components/ui";
import { ActionForm, Field, inputCls } from "@/components/action-form";
import { perfilAction } from "../membros/actions";
import { TIPO_LABEL, formatDate } from "@/lib/format";

export default async function Perfil() {
  const user = await requireUser();
  const { pessoa, vinculos } = await getPerson(user.id, user.id);
  const contribuicoes = await minhasContribuicoes(user.id);
  const ativos = vinculos.filter((v) => !v.fim);
  return (
    <div className="space-y-4">
      <h1 className="font-titulo text-2xl text-verde">Meu perfil</h1>
      <Card title="Meus dados">
        <p className="mb-3 text-sm"><strong>{pessoa.nome}</strong><br /><span className="text-tinta/70">{pessoa.email}</span></p>
        <ActionForm action={perfilAction} submit="Salvar" resetOnOk={false}>
          <Field label="Telefone (opcional)"><input name="telefone" defaultValue={pessoa.telefone ?? ""} inputMode="tel" className={inputCls} /></Field>
        </ActionForm>
      </Card>
      <Card title="Minhas estruturas">
        {ativos.length === 0 ? <Empty>Você ainda não está vinculado(a) a nenhuma estrutura.</Empty> : (
          <ul className="divide-y divide-borda text-sm">
            {ativos.map((v) => <li key={v.id} className="py-2"><strong>{v.nome}</strong> ({TIPO_LABEL[v.tipo]})<br /><span className="text-xs text-tinta/60">{v.funcao ?? "Integrante"} · desde {formatDate(v.inicio)}</span></li>)}
          </ul>
        )}
      </Card>
      {contribuicoes.length > 0 && (
        <Card title="Minhas contribuições">
          <ul className="divide-y divide-borda text-sm">{contribuicoes.map((c) => <li key={c.id} className="flex justify-between py-2"><span>{formatDate(c.data)} · {c.categoria}</span><span>{formatBRL(c.valor_centavos)}</span></li>)}</ul>
          <p className="mt-2 text-xs text-tinta/60">Somente você e a tesouraria autorizada veem este histórico. Ele nunca é usado para avaliar ninguém.</p>
        </Card>
      )}
      <Card title="Privacidade">
        <p className="text-sm text-tinta/70">Seus dados são usados apenas para a vida comunitária e visíveis somente às coordenações das estruturas em que você participa. <a href="/privacidade" className="text-verde underline">Aviso de privacidade</a></p>
      </Card>
    </div>
  );
}
