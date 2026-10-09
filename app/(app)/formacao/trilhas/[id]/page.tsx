import { notFound } from "next/navigation";
import Link from "next/link";
import { requireUser } from "@/lib/auth/session";
import { getTrilha } from "@/lib/services/formacao";
import { can } from "@/lib/permissions";
import { NotFoundError } from "@/lib/services/errors";
import { Badge, Card } from "@/components/ui";
import { ActionForm } from "@/components/action-form";
import { CATEGORIA_ROTULO } from "@/lib/validation/formacao";
import { excluirTrilhaAction } from "../../actions";
import { Check } from "lucide-react";

export default async function TrilhaDetalhe({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) notFound();
  let d;
  try { d = await getTrilha(user.id, id); } catch (e) { if (e instanceof NotFoundError) notFound(); throw e; }
  const excluir = await can(user.id, "conteudos", "excluir", d.trilha.unit_id);
  const feitos = d.itens.filter((i) => Number(i.concluido) === 1).length;
  return (
    <div className="space-y-4">
      <Link href="/formacao" className="inline-flex min-h-11 items-center text-sm text-verde">← Orações e formação</Link>
      <header>
        <Badge>{d.trilha.unit_nome ?? "Toda a comunidade"}</Badge>
        <h1 className="mt-1 font-titulo text-2xl text-verde">{d.trilha.titulo}</h1>
        {d.trilha.descricao && <p className="text-sm text-tinta/70">{d.trilha.descricao}</p>}
        <p className="mt-1 text-sm">{feitos} de {d.itens.length} concluídos <span className="text-xs text-tinta/50">(progresso só visível para você)</span></p>
      </header>
      <Card>
        <ol className="divide-y divide-borda">
          {d.itens.map((c, i) => (
            <li key={c.id}><Link href={`/formacao/${c.id}`} className="flex min-h-14 items-center gap-3 py-2">
              <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm ${Number(c.concluido) ? "bg-verde text-white" : "border border-borda"}`}>{Number(c.concluido) ? <Check size={16} aria-label="concluído" /> : i + 1}</span>
              <span><span className="font-medium">{c.titulo}</span><span className="block text-xs text-tinta/60">{CATEGORIA_ROTULO[c.categoria as "oracao"]}</span></span>
            </Link></li>
          ))}
        </ol>
      </Card>
      {excluir && <ActionForm action={excluirTrilhaAction} submit="Excluir trilha" danger><input type="hidden" name="id" value={id} /></ActionForm>}
    </div>
  );
}
