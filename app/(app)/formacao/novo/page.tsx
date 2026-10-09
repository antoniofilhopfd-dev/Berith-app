import { notFound } from "next/navigation";
import Link from "next/link";
import { requireUser } from "@/lib/auth/session";
import { unitsFor } from "@/lib/services/alvos";
import { podeCriarConteudo } from "@/lib/services/formacao";
import { ConteudoForm } from "@/components/conteudo-form";
import { Card } from "@/components/ui";
import { criarConteudoAction } from "../actions";

export default async function NovoConteudo() {
  const user = await requireUser();
  const [unidades, comunidade] = await Promise.all([unitsFor(user.id, "conteudos", "criar"), podeCriarConteudo(user.id, null)]);
  if (!comunidade && unidades.length === 0) notFound();
  return (
    <div className="space-y-4">
      <Link href="/formacao" className="inline-flex min-h-11 items-center text-sm text-verde">← Orações e formação</Link>
      <h1 className="font-titulo text-2xl text-verde">Novo conteúdo</h1>
      <Card><ConteudoForm action={criarConteudoAction} unidades={unidades} comunidade={comunidade} /></Card>
    </div>
  );
}
