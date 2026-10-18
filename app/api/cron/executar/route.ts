import { NextResponse, type NextRequest } from "next/server";
import { gerarLembretes, processarFila, coletarMetricas } from "@/lib/services/agendamento";
import { processarPush, pushConfigurado, segredoValido } from "@/lib/services/push";
import { baseUrl } from "@/lib/auth/guard";
import { setSetting } from "@/lib/services/configuracoes";

export const dynamic = "force-dynamic";
const resp = (b: unknown, status = 200) => NextResponse.json(b, { status, headers: { "Cache-Control": "no-store" } });

/**
 * Chamado pelo agendador (cron da Hostinger, a cada 1–5 min) com Authorization: Bearer CRON_SECRET.
 * Executa: fila de publicações → lembretes → coleta de métricas → entrega de push. Cada etapa é independente.
 */
export async function POST(req: NextRequest) {
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!process.env.CRON_SECRET || process.env.CRON_SECRET.length < 24) return resp({ erro: "Agendador não configurado." }, 503);
  if (!segredoValido(token)) return resp({ erro: "Não autorizado." }, 401);
  const seguro = async <T,>(fn: () => Promise<T>): Promise<T | { erro: string }> => {
    try { return await fn(); } catch (e) { console.error("[cron]", e instanceof Error ? e.message : "erro"); return { erro: "falhou" }; }
  };
  await seguro(() => setSetting("cron_ultima_execucao", new Date().toISOString()));
  const base = await baseUrl();
  const fila = await seguro(() => processarFila(base));
  const lembretes = await seguro(() => gerarLembretes());
  // Métricas: no máximo uma vez a cada execução da hora cheia (cada rede limita as consultas).
  const minuto = new Date().getUTCMinutes();
  const metricas = minuto < 5 ? await seguro(() => coletarMetricas()) : { pulado: true };
  const push = pushConfigurado() ? await seguro(() => processarPush()) : { pulado: "Web Push não configurado" };
  return resp({ ok: true, fila, lembretes, metricas, push });
}
