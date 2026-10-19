"use client";

/** Abre o diálogo de impressão do navegador (o relatório tem estilos próprios para A4: "Salvar como PDF"). */
export function BotaoImprimir({ rotulo = "Imprimir / salvar PDF" }: { rotulo?: string }) {
  return <button type="button" onClick={() => window.print()} className="inline-flex min-h-10 items-center rounded-lg bg-verde px-4 text-sm text-white">{rotulo}</button>;
}
