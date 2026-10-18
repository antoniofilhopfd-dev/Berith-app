import { PublicShell } from "@/components/public-shell";
import { ActionForm, Field, inputCls } from "@/components/action-form";
import { aceitarConviteAction } from "@/lib/auth/public-actions";
import { getValidInvitation } from "@/lib/services/equipe";

export const dynamic = "force-dynamic";

export default async function Convite({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const inv = await getValidInvitation(token);
  return (
    <PublicShell titulo="Convite" sub={inv ? `Olá, ${inv.nome}! Crie sua senha para concluir o cadastro.` : undefined}>
      {!inv ? (
        <p role="alert" className="text-sm text-red-800">Convite inválido ou expirado. Peça um novo à coordenação.</p>
      ) : (
        <ActionForm action={aceitarConviteAction} submit="Concluir cadastro">
          <input type="hidden" name="token" value={token} />
          <p className="text-sm text-tinta/70">E-mail: <strong>{inv.email}</strong></p>
          <Field label="Senha (mín. 10, com letras e números)"><input name="senha" type="password" autoComplete="new-password" required minLength={10} className={inputCls} /></Field>
          <Field label="Confirmar senha"><input name="confirmar" type="password" autoComplete="new-password" required className={inputCls} /></Field>
          <p className="text-xs text-tinta/60">Ao continuar, você concorda com o uso dos seus dados conforme o <a href="/privacidade" className="underline">aviso de privacidade</a>.</p>
        </ActionForm>
      )}
    </PublicShell>
  );
}
