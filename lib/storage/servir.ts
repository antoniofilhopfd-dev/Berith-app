import { Readable } from "node:stream";
import { NextResponse, type NextRequest } from "next/server";
import { fluxo } from "./disco";
import { lerRange } from "./tipos";

const semCache = { "Cache-Control": "private, no-store" };

/** Resposta de arquivo com Range (vídeo no Safari), nosniff e CSP restritiva. */
export function servirArquivo(req: NextRequest, m: { arquivo: string; mime: string; tamanho: number | string; nome_original: string }, o: { baixar: boolean; cache?: string }) {
  const tamanho = Number(m.tamanho);
  const base = o.cache ? { "Cache-Control": o.cache } : semCache;
  const headers: Record<string, string> = {
    ...base,
    "Content-Type": m.mime,
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "default-src 'none'; img-src 'self' data:; media-src 'self'; style-src 'unsafe-inline'; sandbox",
    "Content-Disposition": `${o.baixar ? "attachment" : "inline"}; filename*=UTF-8''${encodeURIComponent(m.nome_original)}`,
    "Accept-Ranges": "bytes",
  };
  const range = lerRange(req.headers.get("range"), tamanho);
  if (range === "invalido") return new NextResponse(null, { status: 416, headers: { ...headers, "Content-Range": `bytes */${tamanho}` } });
  if (range) {
    const body = Readable.toWeb(fluxo(m.arquivo, range.inicio, range.fim)) as ReadableStream;
    return new NextResponse(body, { status: 206, headers: { ...headers, "Content-Range": `bytes ${range.inicio}-${range.fim}/${tamanho}`, "Content-Length": String(range.fim - range.inicio + 1) } });
  }
  return new NextResponse(Readable.toWeb(fluxo(m.arquivo)) as ReadableStream, { status: 200, headers: { ...headers, "Content-Length": String(tamanho) } });
}
export const respostaSemCache = (corpo: string, status: number) => new NextResponse(corpo, { status, headers: semCache });
