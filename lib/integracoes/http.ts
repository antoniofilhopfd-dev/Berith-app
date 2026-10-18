import { mascarar } from "./cripto";

/** fetch com timeout e mensagens de erro sem segredos. Tudo que sai para as plataformas passa por aqui. */
export async function chamar(url: string, init: RequestInit & { timeoutMs?: number } = {}): Promise<{ status: number; json: unknown; texto: string; headers: Headers }> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), init.timeoutMs ?? 30_000);
  try {
    const r = await fetch(url, { ...init, signal: ctrl.signal });
    const texto = await r.text();
    let json: unknown = null;
    try { json = texto ? JSON.parse(texto) : null; } catch { /* resposta não JSON */ }
    return { status: r.status, json, texto, headers: r.headers };
  } catch (e) {
    const msg = e instanceof Error && e.name === "AbortError" ? "tempo esgotado" : e instanceof Error ? e.message : "falha de rede";
    throw new Error(mascarar(`Falha ao chamar a plataforma: ${msg}`));
  } finally { clearTimeout(t); }
}

export const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" ? (v as Record<string, unknown>) : {});
export const str = (v: unknown): string | null => (typeof v === "string" && v ? v : typeof v === "number" ? String(v) : null);
export const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
/** Extrai uma mensagem curta e sem segredos do erro devolvido pela plataforma. */
export function erroPlataforma(json: unknown, texto: string, status: number): string {
  const j = obj(json); const e = obj(j.error);
  const m = str(e.message) ?? str(j.error_description) ?? (typeof j.error === "string" ? j.error : null) ?? str(obj(obj(j.error).errors).message) ?? texto.slice(0, 200);
  return mascarar(`HTTP ${status}: ${m}`).slice(0, 400);
}
