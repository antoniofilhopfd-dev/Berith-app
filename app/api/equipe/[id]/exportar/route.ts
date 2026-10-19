import { NextResponse, type NextRequest } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { ForbiddenError } from "@/lib/permissions";
import { limitar } from "@/lib/auth/limite";
import { DomainError } from "@/lib/services/errors";
import { exportarDadosDaPessoa } from "@/lib/services/lgpd";

export const dynamic = "force-dynamic";
const h = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };

/** Dados pessoais de uma pessoa da equipe (LGPD), em JSON. Só quem gerencia a equipe; registrado na auditoria. */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return new NextResponse("Não autenticado", { status: 401, headers: h });
  const lim = limitar(`lgpd-exportar:${user.id}`, 10, 10 * 60_000);
  if (!lim.ok) return new NextResponse("Muitas exportações em pouco tempo.", { status: 429, headers: { ...h, "Retry-After": String(lim.esperarSeg) } });
  const id = Number((await ctx.params).id);
  if (!Number.isInteger(id) || id <= 0) return new NextResponse("Pessoa inválida", { status: 400, headers: h });
  try {
    const dados = await exportarDadosDaPessoa(user.id, id);
    return new NextResponse(JSON.stringify(dados, null, 2), { headers: { ...h, "Content-Type": "application/json; charset=utf-8", "Content-Disposition": `attachment; filename="dados-pessoa-${id}.json"` } });
  } catch (e) {
    if (e instanceof ForbiddenError) return new NextResponse("Sem permissão", { status: 403, headers: h });
    if (e instanceof DomainError) return new NextResponse(e.message, { status: 422, headers: h });
    console.error("[lgpd-exportar]", e instanceof Error ? e.message : "erro");
    return new NextResponse("Erro ao gerar o arquivo", { status: 500, headers: h });
  }
}
