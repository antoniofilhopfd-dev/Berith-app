import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { can } from "@/lib/permissions";

/** Barreira de acesso do módulo (cada serviço/ação confere de novo). Sem permissão: 404, sem revelar o módulo. */
export default async function FinanceiroLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  if (!(await can(user.id, "financeiro", "ver", null))) notFound();
  return <>{children}</>;
}
