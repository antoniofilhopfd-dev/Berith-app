"use client";

import { useActionState } from "react";
import { loginCodigoAction, type LoginState } from "@/lib/auth/actions";
import { useHidratado } from "@/components/hidratado";

export function CodigoForm({ next = "" }: { next?: string }) {
  const [state, action, pendente] = useActionState<LoginState, FormData>(loginCodigoAction, {});
  const pronto = useHidratado();
  return (
    <form action={action} method="post" className="space-y-4 rounded-2xl border border-borda bg-cartao p-5 shadow-sm">
      <input type="hidden" name="next" value={next} />
      <label className="block">
        <span className="mb-1 block text-sm font-medium">Código de acesso</span>
        <input name="codigo" inputMode="text" autoCapitalize="characters" autoCorrect="off" spellCheck={false} autoComplete="one-time-code" required maxLength={12}
          placeholder="XXXX-XXXX" aria-describedby="ajuda-codigo"
          className="min-h-12 w-full rounded-lg border border-borda px-3 text-center font-mono text-xl uppercase tracking-widest outline-none focus:border-verde focus:ring-2 focus:ring-verde/20" />
        <span id="ajuda-codigo" className="mt-1 block text-xs text-tinta/60">O código é pessoal e foi entregue por quem administra o app.</span>
      </label>
      {state.erro && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{state.erro}</p>}
      <button type="submit" disabled={pendente || !pronto}
        className="min-h-11 w-full rounded-lg bg-verde font-medium text-white transition hover:bg-verde-escuro disabled:opacity-60">
        {pendente ? "Entrando…" : "Entrar"}
      </button>
    </form>
  );
}
