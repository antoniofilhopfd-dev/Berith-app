import { NextResponse, type NextRequest } from "next/server";
import { gerarLembretes, processarPush, pushConfigurado, segredoValido } from "@/lib/services/push";
import { importar } from "@/lib/services/liturgia-importacao";

export const dynamic = "force-dynamic";
const resp = (b: unknown, status = 200, extra: Record<string, string> = {}) => NextResponse.json(b, { status, headers: { "Cache-Control": "no-store", ...extra } });

/**
 * Chamado pelo agendador (cron) a cada 5 minutos: Authorization: Bearer <CRON_SECRET>.
 * Gera lembretes devidos e entrega o Web Push pendente. Somente POST.
 */
export async function POST(req: NextRequest) {
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!process.env.CRON_SECRET || process.env.CRON_SECRET.length < 24) return resp({ erro: "Agendador não configurado." }, 503);
  if (!segredoValido(token)) return resp({ erro: "Não autorizado." }, 401);
  try {
    const lembretes = await gerarLembretes();
    const liturgia = await importar().catch((e) => ({ executado: false, erros: [e instanceof Error ? e.message.slice(0, 120) : "erro"] }));
    if (!pushConfigurado()) return resp({ ok: false, lembretes, liturgia, erro: "Web Push não configurado (VAPID)." }, 503);
    const push = await processarPush();
    return resp({ ok: true, lembretes, liturgia, push });
  } catch (e) {
    console.error("[push/enviar]", e instanceof Error ? e.message : "erro");
    return resp({ ok: false, erro: "Falha ao processar." }, 500);
  }
}
export const GET = () => resp({ erro: "Método não permitido." }, 405, { Allow: "POST" });
export const PUT = GET; export const DELETE = GET; export const PATCH = GET;
