import { emailParaExibir } from "@/lib/services/equipe";
import { requireUser } from "@/lib/auth/session";
import { perfisDe, PERFIL_ROTULO } from "@/lib/permissions";
import { meusDados } from "@/lib/services/equipe";
import { ActionForm, Field, inputCls } from "@/components/action-form";
import { Badge, Card } from "@/components/ui";
import { perfilAction } from "../actions";

export const metadata = { title: "Meu perfil" };
export const dynamic = "force-dynamic";

export default async function Perfil() {
  const user = await requireUser();
  const [d, perfis] = await Promise.all([meusDados(user.id), perfisDe(user.id)]);
  return (
    <Card title="Meus dados">
      <p className="mb-3 text-sm">{emailParaExibir(d.email) ? `${emailParaExibir(d.email)} · ` : ""}{perfis[0] ? <Badge tom="verde">{PERFIL_ROTULO[perfis[0]]}</Badge> : <Badge tom="cinza">sem perfil de acesso</Badge>}</p>
      <ActionForm action={perfilAction} submit="Salvar" resetOnOk={false}>
        <Field label="Nome"><input name="nome" required minLength={2} maxLength={150} defaultValue={d.nome} autoComplete="name" className={inputCls} /></Field>
        <Field label="Telefone (opcional)"><input name="telefone" defaultValue={d.telefone ?? ""} inputMode="tel" autoComplete="tel" className={inputCls} /></Field>
        <p className="text-xs text-tinta/60">Seu acesso é pelo código de acesso, entregue por quem administra o app (peça um novo se precisar trocar). <a href="/privacidade" className="underline">Aviso de privacidade</a></p>
      </ActionForm>
    </Card>
  );
}
