import { Readable } from "node:stream";
import { NextResponse, type NextRequest } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { abrirArquivo } from "@/lib/services/arquivos";
import { fluxo } from "@/lib/storage/disco";
import { lerRange } from "@/lib/storage/tipos";
import { NotFoundError } from "@/lib/services/errors";

export const dynamic = "force-dynamic";

/** Download/visualização protegidos: sessão + acesso ao contexto do arquivo, a cada requisição. Nunca em cache público. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  const semCache = { "Cache-Control": "private, no-store" };
  if (!user) return new NextResponse("Não autenticado", { status: 401, headers: semCache });
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) return new NextResponse("Não encontrado", { status: 404, headers: semCache });
  try {
    const { arquivo: a, permitirDownload } = await abrirArquivo(user.id, id);
    const tamanho = Number(a.tamanho);
    const baixar = req.nextUrl.searchParams.get("baixar") === "1";
    if (baixar && !permitirDownload) return new NextResponse("Download desativado para este álbum.", { status: 403, headers: semCache });
    const headers: Record<string, string> = {
      ...semCache,
      "Content-Type": a.mime,
      "X-Content-Type-Options": "nosniff",
      // PDF: o visualizador do Chrome não abre documentos com "sandbox"; os demais tipos ficam isolados.
      "Content-Security-Policy": a.mime === "application/pdf" ? "default-src 'none'" : "default-src 'none'; img-src 'self' data:; media-src 'self'; style-src 'unsafe-inline'; sandbox",
      "Content-Disposition": `${baixar ? "attachment" : "inline"}; filename*=UTF-8''${encodeURIComponent(a.nome_original)}`,
      "Accept-Ranges": "bytes",
    };
    const range = lerRange(req.headers.get("range"), tamanho);
    if (range === "invalido") return new NextResponse(null, { status: 416, headers: { ...headers, "Content-Range": `bytes */${tamanho}` } });
    if (range) {
      const body = Readable.toWeb(fluxo(a.arquivo, range.inicio, range.fim)) as ReadableStream;
      return new NextResponse(body, { status: 206, headers: { ...headers, "Content-Range": `bytes ${range.inicio}-${range.fim}/${tamanho}`, "Content-Length": String(range.fim - range.inicio + 1) } });
    }
    return new NextResponse(Readable.toWeb(fluxo(a.arquivo)) as ReadableStream, { status: 200, headers: { ...headers, "Content-Length": String(tamanho) } });
  } catch (e) {
    if (e instanceof NotFoundError) return new NextResponse("Não encontrado", { status: 404, headers: semCache });
    console.error("[download]", e instanceof Error ? e.message : "erro");
    return new NextResponse("Erro ao abrir o arquivo", { status: 500, headers: semCache });
  }
}
