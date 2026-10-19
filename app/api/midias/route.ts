import { NextResponse, type NextRequest } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { receberUpload } from "@/lib/services/midia";
import { MAX_BYTES } from "@/lib/storage/tipos";
import { limitar } from "@/lib/auth/limite";
import { ForbiddenError } from "@/lib/permissions";
import { DomainError, NotFoundError } from "@/lib/services/errors";

export const dynamic = "force-dynamic";
const json = (b: unknown, status = 200) => NextResponse.json(b, { status, headers: { "Cache-Control": "no-store" } });

/**
 * Envio em fluxo (corpo bruto = o próprio arquivo), sem carregar tudo na memória:
 * cabeçalhos X-Nome (URL-encoded) e X-Pasta (opcional). Valida sessão, origem, tamanho e o tipo real.
 */
export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return json({ erro: "Sessão expirada. Entre novamente." }, 401);
  const lim = limitar(`upload:${user.id}`, 120, 10 * 60_000);
  if (!lim.ok) return NextResponse.json({ erro: `Muitos envios em pouco tempo. Tente de novo em ${lim.esperarSeg} s.` }, { status: 429, headers: { "Cache-Control": "no-store", "Retry-After": String(lim.esperarSeg) } });
  const origin = req.headers.get("origin");
  if (origin) { let host = ""; try { host = new URL(origin).host; } catch { /* inválida */ } if (host !== req.headers.get("host")) return json({ erro: "Origem não permitida." }, 403); }
  const len = Number(req.headers.get("content-length") ?? 0);
  if (!Number.isFinite(len) || len <= 0) return json({ erro: "Envio inválido." }, 400);
  if (len > MAX_BYTES()) return json({ erro: "Arquivo grande demais." }, 413);
  if (!req.body) return json({ erro: "Envio inválido." }, 400);
  let nome = "arquivo";
  try { nome = decodeURIComponent(req.headers.get("x-nome") ?? "arquivo").slice(0, 200); } catch { /* mantém padrão */ }
  const pasta = Number(req.headers.get("x-pasta") ?? "");
  try {
    const r = await receberUpload(user.id, { nome, corpo: req.body, pastaId: Number.isInteger(pasta) && pasta > 0 ? pasta : null });
    return json({ ok: true, id: r.id, duplicada: r.duplicada }, r.duplicada ? 200 : 201);
  } catch (e) {
    if (e instanceof DomainError) return json({ erro: e.message }, 422);
    if (e instanceof ForbiddenError || e instanceof NotFoundError) return json({ erro: "Você não tem permissão para enviar mídias." }, 403);
    console.error("[upload]", e instanceof Error ? e.message : "erro");
    return json({ erro: "Não foi possível enviar o arquivo." }, 500);
  }
}
