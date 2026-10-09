import { NextResponse, type NextRequest } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { enviarArquivo, CTX_TIPOS, type CtxTipo } from "@/lib/services/arquivos";
import { MAX_BYTES } from "@/lib/storage/tipos";
import { ForbiddenError } from "@/lib/permissions";
import { DomainError, NotFoundError } from "@/lib/services/errors";

export const dynamic = "force-dynamic";
const json = (b: unknown, status = 200) => NextResponse.json(b, { status, headers: { "Cache-Control": "no-store" } });

/** Envio de arquivo (multipart). Valida sessão, origem, tamanho, permissão no contexto e o tipo real do arquivo. */
export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return json({ erro: "Sessão expirada. Entre novamente." }, 401);
  const origin = req.headers.get("origin");
  if (origin && new URL(origin).host !== req.headers.get("host")) return json({ erro: "Origem não permitida." }, 403);
  const len = Number(req.headers.get("content-length") ?? 0);
  if (!Number.isFinite(len) || len > MAX_BYTES + 64 * 1024) return json({ erro: "Arquivo grande demais." }, 413);
  let form: FormData;
  try { form = await req.formData(); } catch { return json({ erro: "Envio inválido." }, 400); }
  const arquivo = form.get("arquivo");
  const tipo = String(form.get("ctxTipo") ?? "") as CtxTipo;
  const ctxId = Number(form.get("ctxId"));
  if (!(arquivo instanceof File) || !CTX_TIPOS.includes(tipo) || !Number.isInteger(ctxId) || ctxId < 0) return json({ erro: "Dados inválidos." }, 400);
  try {
    const dados = new Uint8Array(await arquivo.arrayBuffer());
    const id = await enviarArquivo(user.id, {
      tipo, ctxId, nome: arquivo.name, dados, descricao: String(form.get("descricao") ?? "") || null, autorizacaoImagem: form.get("autorizacaoImagem") === "on",
    });
    return json({ ok: true, id }, 201);
  } catch (e) {
    if (e instanceof DomainError) return json({ erro: e.message }, 422);
    if (e instanceof ForbiddenError || e instanceof NotFoundError) return json({ erro: "Você não tem permissão para enviar arquivos aqui." }, 403);
    console.error("[upload]", e instanceof Error ? e.message : "erro");
    return json({ erro: "Não foi possível enviar o arquivo." }, 500);
  }
}
