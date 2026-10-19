import { NextResponse, type NextRequest } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { assertCan, ForbiddenError } from "@/lib/permissions";
import { gerarRelatorioMensal, mesAtual } from "@/lib/services/relatorios";
import { gerarXlsx } from "@/lib/export/xlsx";
import { gerarPdf } from "@/lib/export/pdf";
import { paraPdf, paraPlanilhas } from "@/lib/export/relatorio";
import { lerConfig } from "@/lib/services/configuracoes";
import { audit } from "@/lib/services/audit";
import { DomainError } from "@/lib/services/errors";
import { limitar } from "@/lib/auth/limite";

export const dynamic = "force-dynamic";
const h = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };

/** Exportação do relatório (PDF ou Excel). Exige a permissão específica de exportar e é registrada na auditoria. */
export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return new NextResponse("Não autenticado", { status: 401, headers: h });
  const lim = limitar(`exportar:${user.id}`, 20, 10 * 60_000);
  if (!lim.ok) return new NextResponse("Muitas exportações em pouco tempo.", { status: 429, headers: { ...h, "Retry-After": String(lim.esperarSeg) } });
  const p = req.nextUrl.searchParams;
  const formato = p.get("formato") === "xlsx" ? "xlsx" : "pdf";
  try {
    await assertCan(user.id, "relatorios", "exportar");
    const rel = await gerarRelatorioMensal(user.id, p.get("mes") ?? mesAtual(), p.get("conta") || undefined);
    await audit(user.id, "relatorio.exportar", { entidade: "relatorio", detalhes: { formato, mes: rel.mes } });
    const nome = `relatorio-instagram-${rel.mes}.${formato}`;
    const cab = { ...h, "Content-Disposition": `attachment; filename="${nome}"` };
    if (formato === "xlsx") return new NextResponse(new Uint8Array(gerarXlsx(paraPlanilhas(rel))), { headers: { ...cab, "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" } });
    const cfg = await lerConfig();
    return new NextResponse(new Uint8Array(await gerarPdf(paraPdf(rel, cfg.nomeMinisterio))), { headers: { ...cab, "Content-Type": "application/pdf" } });
  } catch (e) {
    if (e instanceof ForbiddenError) return new NextResponse("Sem permissão", { status: 403, headers: h });
    if (e instanceof DomainError) return new NextResponse(e.message, { status: 422, headers: h });
    console.error("[exportar]", e instanceof Error ? e.message : "erro");
    return new NextResponse("Erro ao gerar o arquivo", { status: 500, headers: h });
  }
}
