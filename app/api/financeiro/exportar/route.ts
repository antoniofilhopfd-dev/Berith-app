import { NextResponse, type NextRequest } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { exportarCsv } from "@/lib/services/financeiro";
import { ForbiddenError } from "@/lib/permissions";

export const dynamic = "force-dynamic";
const base = { "Cache-Control": "no-store" };

/** Exportação financeira: sessão + permissão "exportar" conferidas aqui; a exportação é auditada. */
export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return new NextResponse("Não autenticado", { status: 401, headers: base });
  const periodo = req.nextUrl.searchParams.get("periodo") ?? "";
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(periodo)) return new NextResponse("Período inválido", { status: 400, headers: base });
  try {
    return new NextResponse(await exportarCsv(user.id, periodo), { headers: { ...base, "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="financeiro-${periodo}.csv"`, "X-Content-Type-Options": "nosniff" } });
  } catch (e) {
    if (e instanceof ForbiddenError) return new NextResponse("Acesso negado", { status: 403, headers: base });
    console.error("[financeiro/exportar]", e instanceof Error ? e.message : "erro");
    return new NextResponse("Erro ao exportar", { status: 500, headers: base });
  }
}
