import { notFound } from "next/navigation";
import Link from "next/link";
import { requireUser } from "@/lib/auth/session";
import { creationTargets } from "@/lib/services/eventos";
import { listUnits } from "@/lib/services/estruturas";
import { query } from "@/lib/db";
import { EventoForm } from "@/components/evento-form";
import { Card } from "@/components/ui";
import { criarEventoAction } from "../actions";
import type { RowDataPacket } from "mysql2/promise";

export default async function NovoEvento() {
  const user = await requireUser();
  const alvos = await creationTargets(user.id);
  // Lista de estruturas para o formulário: apenas as ativas em que o usuário pode criar eventos.
  let unidades: { id: number; nome: string; tipo: string }[] = [];
  if (alvos.unidades === "todas") {
    unidades = await query<RowDataPacket & { id: number; nome: string; tipo: string }>("SELECT id, nome, tipo FROM org_units WHERE ativo = 1 ORDER BY tipo, nome");
  } else if (alvos.unidades.length) {
    unidades = (await listUnits(user.id)).filter((u) => alvos.unidades !== "todas" && alvos.unidades.includes(u.id) && u.ativo);
    if (unidades.length === 0) {
      unidades = await query<RowDataPacket & { id: number; nome: string; tipo: string }>("SELECT id, nome, tipo FROM org_units WHERE ativo = 1 AND id IN (?) ORDER BY tipo, nome", [alvos.unidades]);
    }
  }
  if (!alvos.comunidade && unidades.length === 0) notFound();
  return (
    <div className="space-y-4">
      <Link href="/eventos" className="inline-flex min-h-11 items-center text-sm text-verde">← Agenda</Link>
      <h1 className="font-titulo text-2xl text-verde">Novo evento</h1>
      <Card><EventoForm action={criarEventoAction} unidades={unidades} comunidade={alvos.comunidade} /></Card>
    </div>
  );
}
