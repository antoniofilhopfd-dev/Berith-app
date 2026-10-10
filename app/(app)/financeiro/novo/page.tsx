import { notFound } from "next/navigation";
import Link from "next/link";
import { requireUser } from "@/lib/auth/session";
import { can } from "@/lib/permissions";
import { contasECategorias } from "@/lib/services/financeiro";
import { LancamentoForm } from "@/components/lancamento-form";
import { Card } from "@/components/ui";
import { todayLocal } from "@/lib/time";
import { criarLancamentoAction } from "../actions";

export default async function NovoLancamento() {
  const user = await requireUser();
  if (!(await can(user.id, "financeiro", "criar", null))) notFound();
  const { contas, categorias } = await contasECategorias();
  return (
    <div className="space-y-4">
      <Link href="/financeiro" className="inline-flex min-h-11 items-center text-sm text-verde">← Financeiro</Link>
      <h1 className="font-titulo text-2xl text-verde">Novo lançamento</h1>
      <Card><LancamentoForm action={criarLancamentoAction} contas={contas.filter((c) => c.ativa)} categorias={categorias.filter((c) => c.ativa)} hoje={todayLocal()} /></Card>
    </div>
  );
}
