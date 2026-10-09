import Link from "next/link";
import { PublicShell } from "@/components/public-shell";
import { ActionForm, Field, inputCls } from "@/components/action-form";
import { solicitarRedefinicaoAction } from "@/lib/auth/public-actions";

export default function Recuperar() {
  return (
    <PublicShell titulo="Recuperar senha" sub="Informe o e-mail do seu cadastro">
      <ActionForm action={solicitarRedefinicaoAction} submit="Enviar instruções">
        <Field label="E-mail"><input name="email" type="email" autoComplete="username" required className={inputCls} /></Field>
      </ActionForm>
      <Link href="/login" className="mt-4 inline-flex min-h-11 items-center text-sm text-verde">← Voltar ao login</Link>
    </PublicShell>
  );
}
