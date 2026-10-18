import type { NextRequest } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { abrirMidia } from "@/lib/services/midia";
import { NotFoundError } from "@/lib/services/errors";
import { ForbiddenError } from "@/lib/permissions";
import { respostaSemCache, servirArquivo } from "@/lib/storage/servir";

export const dynamic = "force-dynamic";

/** Visualização/download protegidos: sessão + permissão na biblioteca, a cada requisição. Nunca em cache público. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return respostaSemCache("Não autenticado", 401);
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) return respostaSemCache("Não encontrado", 404);
  try {
    const m = await abrirMidia(user.id, id);
    return servirArquivo(req, m, { baixar: req.nextUrl.searchParams.get("baixar") === "1" });
  } catch (e) {
    if (e instanceof NotFoundError || e instanceof ForbiddenError) return respostaSemCache("Não encontrado", 404);
    console.error("[midia]", e instanceof Error ? e.message : "erro");
    return respostaSemCache("Erro ao abrir o arquivo", 500);
  }
}
