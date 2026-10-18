"use client";

import { useState } from "react";

export function CopiarTexto({ texto, rotulo = "Copiar texto" }: { texto: string; rotulo?: string }) {
  const [estado, setEstado] = useState<"idle" | "ok" | "erro">("idle");
  return (
    <span className="inline-flex items-center gap-2">
      <button type="button" onClick={async () => { try { await navigator.clipboard.writeText(texto); setEstado("ok"); } catch { setEstado("erro"); } setTimeout(() => setEstado("idle"), 2500); }}
        className="min-h-10 rounded-lg border border-borda bg-white px-4 text-sm hover:bg-fundo">{rotulo}</button>
      <span role="status" className="text-xs text-tinta/70">{estado === "ok" ? "Copiado!" : estado === "erro" ? "Não foi possível copiar: selecione o texto manualmente." : ""}</span>
    </span>
  );
}
