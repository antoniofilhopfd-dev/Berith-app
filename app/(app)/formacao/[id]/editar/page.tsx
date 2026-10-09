import { notFound } from "next/navigation";
import Link from "next/link";
import { requireUser } from "@/lib/auth/session";
import { getConteudo } from "@/lib/services/formacao";
import { can } from "@/lib/permissions";
import { NotFoundError } from "@/lib/services/errors";
import { ConteudoForm } from "@/components/conteudo-form";
import { Card } from "@/components/ui";
import { editarConteudoAction } from "../../actions";

export default async function EditarConteudo({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) notFound();
  let c;
  try { c = await getConteudo(user.id, id); } catch (e) { if (e instanceof NotFoundError) notFound(); throw e; }
  if (!(await can(user.id, "conteudos", "editar", c.unit_id))) notFound();
  return (
    <div className="space-y-4">
      <Link href={`/formacao/${id}`} className="inline-flex min-h-11 items-center text-sm text-verde">← Conteúdo</Link>
      <h1 className="font-titulo text-2xl text-verde">Editar conteúdo</h1>
      <Card><ConteudoForm action={editarConteudoAction} unidades={[]} comunidade={false} editando valores={{ ...c, unitId: c.unit_id }} /></Card>
    </div>
  );
}
