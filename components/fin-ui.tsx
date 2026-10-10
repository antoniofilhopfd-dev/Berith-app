import Link from "next/link";
import { formatBRL } from "@/lib/dinheiro";
import { Badge } from "./ui";

export function SubNav({ ativo }: { ativo: string }) {
  const itens = [["", "Painel"], ["lancamentos", "Lançamentos"], ["relatorio", "Relatório"], ["periodos", "Períodos"], ["conciliacao", "Conciliação"], ["cadastros", "Cadastros"]];
  return (
    <div role="tablist" className="flex gap-1 overflow-x-auto rounded-xl bg-verde/10 p-1">
      {itens.map(([k, l]) => <Link key={k} role="tab" aria-selected={ativo === k} href={`/financeiro${k ? "/" + k : ""}`} className={`min-h-11 shrink-0 content-center rounded-lg px-4 text-sm ${ativo === k ? "bg-verde text-white" : "text-verde"}`}>{l}</Link>)}
    </div>
  );
}
export const Valor = ({ c, tipo }: { c: number; tipo?: "entrada" | "saida" }) => (
  <span className={`font-medium tabular-nums ${tipo === "saida" ? "text-red-800" : tipo === "entrada" ? "text-green-800" : ""}`}>{tipo === "saida" ? "−" : tipo === "entrada" ? "+" : ""}{formatBRL(Math.abs(c))}</span>
);
export const StatusBadge = ({ s, estornado }: { s: string; estornado?: boolean }) => <Badge>{estornado ? "estornado" : s}</Badge>;
