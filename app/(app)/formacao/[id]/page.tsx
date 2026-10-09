import { notFound } from "next/navigation";
import Link from "next/link";
import { requireUser } from "@/lib/auth/session";
import { getConteudo } from "@/lib/services/formacao";
import { can } from "@/lib/permissions";
import { NotFoundError } from "@/lib/services/errors";
import { CATEGORIA_ROTULO } from "@/lib/validation/formacao";
import { Badge, Card } from "@/components/ui";
import { ActionForm } from "@/components/action-form";
import { Anexos } from "@/components/anexos";
import { concluidoAction, excluirConteudoAction, favoritoAction } from "../actions";
import { ExternalLink } from "lucide-react";

export default async function ConteudoDetalhe({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) notFound();
  let c;
  try { c = await getConteudo(user.id, id); } catch (e) { if (e instanceof NotFoundError) notFound(); throw e; }
  const [editar, excluir] = await Promise.all([can(user.id, "conteudos", "editar", c.unit_id), can(user.id, "conteudos", "excluir", c.unit_id)]);
  return (
    <div className="space-y-4">
      <Link href="/formacao" className="inline-flex min-h-11 items-center text-sm text-verde">← Orações e formação</Link>
      <header>
        <div className="flex flex-wrap gap-1"><Badge>{CATEGORIA_ROTULO[c.categoria as "oracao"]}</Badge><Badge>{c.unit_nome ?? "Toda a comunidade"}</Badge>{!c.publicado && <Badge>rascunho</Badge>}</div>
        <h1 className="mt-1 font-titulo text-2xl text-verde">{c.titulo}</h1>
        {c.resumo && <p className="mt-1 text-sm text-tinta/70">{c.resumo}</p>}
      </header>
      <div className="flex flex-wrap gap-2">
        <ActionForm action={favoritoAction} submit={Number(c.favorito) ? "♥ Remover dos favoritos" : "♡ Favoritar"} className="space-y-0"><input type="hidden" name="id" value={id} /></ActionForm>
        <ActionForm action={concluidoAction} submit={Number(c.concluido) ? "✓ Concluído (desfazer)" : "Marcar como concluído"} className="space-y-0"><input type="hidden" name="id" value={id} /></ActionForm>
      </div>
      {c.corpo && <Card><div className="whitespace-pre-line text-[15px] leading-relaxed">{c.corpo}</div></Card>}
      <Anexos actor={user.id} tipo="conteudo" ctxId={id} titulo="Materiais (PDF e áudio)" />
      <Card>
        <p className="text-xs text-tinta/60">Fonte: {c.fonte_url ? <a href={c.fonte_url} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex items-center gap-1 underline">{c.fonte_nome}<ExternalLink size={12} aria-hidden /></a> : c.fonte_nome}{c.direitos && <> · {c.direitos}</>}</p>
      </Card>
      {(editar || excluir) && (
        <div className="flex flex-wrap gap-2">
          {editar && <Link href={`/formacao/${id}/editar`} className="inline-flex min-h-11 items-center rounded-lg border border-verde px-4 text-sm text-verde">Editar</Link>}
          {excluir && <ActionForm action={excluirConteudoAction} submit="Excluir" danger className="space-y-0"><input type="hidden" name="id" value={id} /></ActionForm>}
        </div>
      )}
    </div>
  );
}
