/** Célula CSV segura: aspas escapadas e fórmulas neutralizadas (=, +, -, @) para planilhas. */
export function celula(v: unknown): string {
  let s = v == null ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return `"${s.replace(/"/g, '""')}"`;
}
export const linhaCsv = (cols: unknown[]) => cols.map(celula).join(";");
export const csv = (linhas: unknown[][]) => "﻿" + linhas.map(linhaCsv).join("\r\n");
