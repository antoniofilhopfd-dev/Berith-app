import { NextResponse, type NextRequest } from "next/server";
import { getSessionUser, type SessionUser } from "@/lib/auth/session";
import { cancelarInscricao, inscrever, validarInscricao } from "@/lib/services/push";
import { DomainError } from "@/lib/services/errors";

export const dynamic = "force-dynamic";
const resp = (b: unknown, status = 200) => NextResponse.json(b, { status, headers: { "Cache-Control": "no-store" } });

/** Devolve o usuário autenticado ou a resposta de erro pronta. */
async function contexto(req: NextRequest): Promise<SessionUser | NextResponse> {
  const user = await getSessionUser();
  if (!user) return resp({ erro: "Sessão expirada." }, 401);
  const origin = req.headers.get("origin");
  if (origin && new URL(origin).host !== req.headers.get("host")) return resp({ erro: "Origem não permitida." }, 403);
  return user;
}

export async function POST(req: NextRequest) {
  const user = await contexto(req); if (user instanceof NextResponse) return user;
  try {
    const i = validarInscricao(await req.json());
    await inscrever(user.id, i, req.headers.get("user-agent"));
    return resp({ ok: true }, 201);
  } catch (e) {
    if (e instanceof DomainError) return resp({ erro: e.message }, 422);
    if (e instanceof SyntaxError) return resp({ erro: "Corpo inválido." }, 400);
    console.error("[push/inscrever]", e instanceof Error ? e.message : "erro");
    return resp({ erro: "Falha ao registrar o dispositivo." }, 500);
  }
}

export async function DELETE(req: NextRequest) {
  const user = await contexto(req); if (user instanceof NextResponse) return user;
  try {
    const body = (await req.json()) as { endpoint?: unknown };
    if (typeof body.endpoint !== "string" || body.endpoint.length > 600) return resp({ erro: "Inscrição inválida." }, 422);
    await cancelarInscricao(user.id, body.endpoint);
    return resp({ ok: true });
  } catch { return resp({ erro: "Corpo inválido." }, 400); }
}
