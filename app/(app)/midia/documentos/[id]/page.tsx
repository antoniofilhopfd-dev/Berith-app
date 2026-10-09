import { notFound } from "next/navigation";
import Link from "next/link";
import { requireUser } from "@/lib/auth/session";
import { Anexos } from "@/components/anexos";
import { query } from "@/lib/db";
import { NotFoundError } from "@/lib/services/errors";
import { listarAnexos } from "@/lib/services/arquivos";
import type { RowDataPacket } from "mysql2/promise";

export default async function Documentos({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id < 0) notFound();
  try { await listarAnexos(user.id, "documento", id); } catch (e) { if (e instanceof NotFoundError) notFound(); throw e; }
  const nome = id === 0 ? "Comunidade (geral)" : ((await query<RowDataPacket>("SELECT nome FROM org_units WHERE id = ?", [id]))[0]?.nome as string);
  return (
    <div className="space-y-4">
      <Link href="/midia" className="inline-flex min-h-11 items-center text-sm text-verde">← Fotos e documentos</Link>
      <h1 className="font-titulo text-2xl text-verde">Documentos — {nome}</h1>
      <Anexos actor={user.id} tipo="documento" ctxId={id} titulo="Arquivos" aceitar="application/pdf,image/jpeg,image/png,image/webp" />
      <p className="text-xs text-tinta/60">Documentos ficam em armazenamento privado: só quem tem acesso a esta estrutura consegue abrir.</p>
    </div>
  );
}
