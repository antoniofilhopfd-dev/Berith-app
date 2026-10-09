import { requireUser } from "@/lib/auth/session";
import { getPerson } from "@/lib/services/membros";
import { Card, Empty } from "@/components/ui";
import { ActionForm, Field, inputCls } from "@/components/action-form";
import { perfilAction } from "../membros/actions";
import { TIPO_LABEL, formatDate } from "@/lib/format";

export default async function Perfil() {
  const user = await requireUser();
  const { pessoa, vinculos } = await getPerson(user.id, user.id);
  const ativos = vinculos.filter((v) => !v.fim);
  return (
    <div className="space-y-4">
      <h1 className="font-titulo text-2xl text-vinho">Meu perfil</h1>
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
      <Card title="Privacidade">
        <p className="text-sm text-tinta/70">Seus dados são usados apenas para a vida comunitária e visíveis somente às coordenações das estruturas em que você participa. <a href="/privacidade" className="text-vinho underline">Aviso de privacidade</a></p>
      </Card>
    </div>
  );
}
