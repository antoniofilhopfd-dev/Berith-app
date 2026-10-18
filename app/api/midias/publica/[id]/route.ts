import type { NextRequest } from "next/server";
import { abrirPorAssinatura, assinaturaValida } from "@/lib/services/midia";
import { NotFoundError } from "@/lib/services/errors";
import { respostaSemCache, servirArquivo } from "@/lib/storage/servir";

export const dynamic = "force-dynamic";

/**
 * Link temporário assinado (HMAC + expiração) usado só para as APIs das redes sociais buscarem a mídia
 * durante a publicação. Não há listagem: sem assinatura válida a resposta é sempre 404.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  const exp = Number(req.nextUrl.searchParams.get("exp"));
  const sig = req.nextUrl.searchParams.get("sig") ?? "";
  if (!Number.isInteger(id) || id <= 0) return respostaSemCache("Não encontrado", 404);
  try {
    if (!assinaturaValida(id, exp, sig)) return respostaSemCache("Não encontrado", 404);
    const m = await abrirPorAssinatura(id);
    return servirArquivo(req, m, { baixar: false });
  } catch (e) {
    if (e instanceof NotFoundError) return respostaSemCache("Não encontrado", 404);
    return respostaSemCache("Não encontrado", 404);
  }
}
