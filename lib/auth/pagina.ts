import { notFound } from "next/navigation";
import { can, type Acao, type Recurso } from "@/lib/permissions";

/** Para páginas: sem permissão, a resposta é 404 (não revela que a área existe). A autorização real continua nos serviços. */
export async function exigir(userId: number, recurso: Recurso, acao: Acao): Promise<void> {
  if (!(await can(userId, recurso, acao))) notFound();
}
