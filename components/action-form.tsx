"use client";

import { useActionState, useEffect, useRef, useTransition } from "react";
import type { ActionResult, FormAction } from "@/lib/auth/guard";

export function ActionForm({
  action, children, submit, className = "", resetOnOk = true, danger = false,
}: {
  action: FormAction; children?: React.ReactNode; submit: string; className?: string; resetOnOk?: boolean; danger?: boolean;
}) {
  const [state, run, pendingAction] = useActionState<ActionResult, FormData>(action, {});
  const [pendingTransition, startTransition] = useTransition();
  const ref = useRef<HTMLFormElement>(null);
  const pending = pendingAction || pendingTransition;
  // O React 19 limpa o formulário após cada action; aqui os campos só são limpos em caso de sucesso.
  useEffect(() => {
    if (state.ok && resetOnOk) ref.current?.reset();
  }, [state, resetOnOk]);
  return (
    <form ref={ref} className={`space-y-3 ${className}`}
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget, (e.nativeEvent as SubmitEvent).submitter);
        startTransition(() => run(fd));
      }}>
      {children}
      {state.erro && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{state.erro}</p>}
      {state.ok && <p role="status" className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-800">{state.ok}</p>}
      {state.link && (
        <div className="rounded-lg border border-cobre/40 bg-amber-50 p-3 text-sm">
          <p className="mb-1 font-medium">Link (mostrado uma única vez — entregue por canal seguro):</p>
          <input readOnly value={state.link} onFocus={(e) => e.currentTarget.select()}
            className="min-h-11 w-full rounded border border-borda bg-white px-2 text-xs" aria-label="Link gerado" />
        </div>
      )}
      <button type="submit" disabled={pending}
        className={`min-h-11 rounded-lg px-4 text-sm font-medium text-white disabled:opacity-60 ${danger ? "bg-red-700 hover:bg-red-800" : "bg-verde hover:bg-verde-escuro"}`}>
        {pending ? "Aguarde…" : submit}
      </button>
    </form>
  );
}

export const inputCls = "min-h-11 w-full rounded-lg border border-borda bg-white px-3 outline-none focus:border-verde focus:ring-2 focus:ring-verde/20";
export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium">{label}</span>
      {children}
    </label>
  );
}
