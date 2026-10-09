import { NextResponse, type NextRequest } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { exportCsv } from "@/lib/services/escalas";
import { ForbiddenError } from "@/lib/permissions";
import { isDate, localToUtc, addDays, todayLocal } from "@/lib/time";

export const dynamic = "force-dynamic";

/** Exportação protegida: sessão válida + permissão "exportar" na estrutura, verificadas aqui (o proxy não basta). */
export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return new NextResponse("Não autenticado", { status: 401, headers: { "Cache-Control": "no-store" } });
  const unit = Number(req.nextUrl.searchParams.get("unit"));
  const de = req.nextUrl.searchParams.get("de") ?? todayLocal();
  const ate = req.nextUrl.searchParams.get("ate") ?? addDays(todayLocal(), 60);
  if (!Number.isInteger(unit) || unit <= 0 || !isDate(de) || !isDate(ate)) return new NextResponse("Parâmetros inválidos", { status: 400 });
  try {
    const csv = await exportCsv(user.id, unit, localToUtc(de, "00:00"), localToUtc(addDays(ate, 1), "00:00"));
    return new NextResponse(csv, {
      headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="escalas-${unit}.csv"`, "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
    });
  } catch (e) {
    if (e instanceof ForbiddenError) return new NextResponse("Acesso negado", { status: 403, headers: { "Cache-Control": "no-store" } });
    console.error("[export]", e instanceof Error ? e.message : "erro");
    return new NextResponse("Erro ao exportar", { status: 500 });
  }
}
