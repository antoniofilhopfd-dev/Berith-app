import Link from "next/link";
import { PublicShell } from "@/components/public-shell";
import { ActionForm, Field, inputCls } from "@/components/action-form";
import { redefinirSenhaAction } from "@/lib/auth/public-actions";
import { isResetTokenValid } from "@/lib/services/senha";

export const dynamic = "force-dynamic";

export default async function Redefinir({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const valido = await isResetTokenValid(token);
  return (
    <PublicShell titulo="Nova senha">
      {!valido ? (
        <p role="alert" className="text-sm text-red-800">Este link é inválido ou expirou. Solicite um novo.</p>
      ) : (
        <ActionForm action={redefinirSenhaAction} submit="Salvar nova senha">
          <input type="hidden" name="token" value={token} />
          <Field label="Nova senha (mín. 10, com letras e números)"><input name="senha" type="password" autoComplete="new-password" required minLength={10} className={inputCls} /></Field>
          <Field label="Confirmar senha"><input name="confirmar" type="password" autoComplete="new-password" required className={inputCls} /></Field>
        </ActionForm>
      )}
      <Link href="/login" className="mt-4 inline-flex min-h-11 items-center text-sm text-verde">Ir para o login</Link>
    </PublicShell>
  );
}
