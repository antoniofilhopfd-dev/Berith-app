import { NextResponse, type NextRequest } from "next/server";
import { executarAgendador, registrarChamadaNegada } from "@/lib/services/agendador";
import { segredoValido } from "@/lib/services/push";

export const dynamic = "force-dynamic";
const resp = (b: unknown, status = 200) => NextResponse.json(b, { status, headers: { "Cache-Control": "no-store" } });

/**
 * Chamado pelo agendador (cron da Hostinger, a cada 1–5 min) com Authorization: Bearer CRON_SECRET.
 * Executa: fila de publicações → lembretes → coleta de métricas → entrega de push. Cada etapa é independente.
 */
export async function POST(req: NextRequest) {
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!process.env.CRON_SECRET || process.env.CRON_SECRET.length < 24) { await registrarChamadaNegada("nao_configurado"); return resp({ erro: "Agendador não configurado." }, 503); }
  if (!segredoValido(token)) { await registrarChamadaNegada("segredo"); return resp({ erro: "Não autorizado." }, 401); }
  return resp(await executarAgendador("cron"));
}
