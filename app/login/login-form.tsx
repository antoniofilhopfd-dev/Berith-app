"use client";

import { useActionState } from "react";
import { loginAction, type LoginState } from "@/lib/auth/actions";

export function LoginForm({ next = "" }: { next?: string }) {
  const [state, action, pendente] = useActionState<LoginState, FormData>(loginAction, {});
  return (
    <form action={action} className="space-y-4 rounded-2xl border border-borda bg-cartao p-5 shadow-sm">
      <input type="hidden" name="next" value={next} />
      <label className="block">
        <span className="mb-1 block text-sm font-medium">E-mail</span>
        <input name="email" type="email" defaultValue={state.email ?? ""} autoComplete="username" required
          className="min-h-11 w-full rounded-lg border border-borda px-3 outline-none focus:border-vinho focus:ring-2 focus:ring-vinho/20" />
      </label>
      <label className="block">
        <span className="mb-1 block text-sm font-medium">Senha</span>
        <input name="senha" type="password" autoComplete="current-password" required
          className="min-h-11 w-full rounded-lg border border-borda px-3 outline-none focus:border-vinho focus:ring-2 focus:ring-vinho/20" />
      </label>
      {state.erro && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{state.erro}</p>}
      <button type="submit" disabled={pendente}
        className="min-h-11 w-full rounded-lg bg-vinho font-medium text-white transition hover:bg-vinho-escuro disabled:opacity-60">
        {pendente ? "Entrando…" : "Entrar"}
      </button>
    </form>
  );
}
