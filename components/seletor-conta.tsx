"use client";

import { useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { trocarContaAction } from "@/app/(app)/conta-actions";

/** Seletor da conta do Instagram no topo (como no EVO MKT). Com uma só conta, só mostra qual é. */
export function SeletorConta({ contas, atual }: { contas: { igId: string; usuario: string; principal: boolean }[]; atual: string }) {
  const [pendente, iniciar] = useTransition();
  const router = useRouter(), pathname = usePathname(), sp = useSearchParams();
  if (contas.length === 0) return null;
  if (contas.length === 1) return <p className="text-sm text-tinta/70" title="Conta do Instagram conectada">Instagram: <strong>{contas[0].usuario}</strong></p>;
  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="text-tinta/70">Instagram</span>
      <select value={atual} disabled={pendente} aria-label="Conta do Instagram usada nos relatórios"
        onChange={(e) => {
          const igId = e.target.value;
          iniciar(async () => {
            const r = await trocarContaAction(igId);
            if (!r.ok) return;
            const q = new URLSearchParams(sp.toString()); q.delete("conta"); // o seletor passa a valer sobre qualquer ?conta= da URL
            router.replace(q.size ? `${pathname}?${q}` : pathname);
            router.refresh();
          });
        }}
        className="min-h-10 rounded-lg border border-borda bg-white px-2 font-medium">
        {contas.map((c) => <option key={c.igId} value={c.igId}>{c.usuario}{c.principal ? " (principal)" : ""}</option>)}
      </select>
    </label>
  );
}
