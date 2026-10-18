import { NextResponse, type NextRequest } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { pesquisarParaSelecao } from "@/lib/services/midia";
import { ForbiddenError } from "@/lib/permissions";

export const dynamic = "force-dynamic";

/** Lista leve para o seletor de mídia do editor (sessão + permissão de ver a biblioteca). */
export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  const h = { "Cache-Control": "no-store" };
  if (!user) return NextResponse.json({ erro: "Sessão expirada." }, { status: 401, headers: h });
  try {
    const itens = await pesquisarParaSelecao(user.id, (req.nextUrl.searchParams.get("q") ?? "").slice(0, 80));
    return NextResponse.json({ itens }, { headers: h });
  } catch (e) {
    if (e instanceof ForbiddenError) return NextResponse.json({ erro: "Sem permissão." }, { status: 403, headers: h });
    return NextResponse.json({ erro: "Erro ao listar." }, { status: 500, headers: h });
  }
}
