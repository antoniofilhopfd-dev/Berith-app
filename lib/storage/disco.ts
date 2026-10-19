import { mkdir, readFile, rename, stat, unlink, writeFile } from "node:fs/promises";
import { createReadStream, createWriteStream } from "node:fs";
import { createHash, randomBytes } from "node:crypto";
import path from "node:path";

/**
 * Diretório de arquivos privados (fora de public/). Em produção, aponte STORAGE_DIR para um local
 * persistente e com backup; o disco da aplicação pode ser recriado a cada deploy (confirmar no hPanel).
 */
export const storageDir = () => path.resolve(process.env.STORAGE_DIR || path.join(/*turbopackIgnore: true*/ process.cwd(), "storage"));
const NOME_VALIDO = /^[0-9a-f]{32}$/;

function caminho(arquivo: string): string {
  if (!NOME_VALIDO.test(arquivo)) throw new Error("Nome de arquivo inválido.");
  return path.join(/*turbopackIgnore: true*/ storageDir(), arquivo.slice(0, 2), arquivo);
}

/** Caminho absoluto do arquivo no armazenamento privado (uso interno: envio às plataformas). */
export const caminhoDoArquivo = (arquivo: string) => caminho(arquivo);

export async function gravar(arquivo: string, dados: Uint8Array) {
  const p = caminho(arquivo);
  await mkdir(path.dirname(p), { recursive: true, mode: 0o700 });
  await writeFile(p, dados, { mode: 0o600, flag: "wx" });
}
export async function remover(arquivo: string) {
  try { await unlink(caminho(arquivo)); } catch (e) { if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e; }
}
export const ler = (arquivo: string) => readFile(caminho(arquivo));
export async function existe(arquivo: string) { try { return (await stat(caminho(arquivo))).isFile(); } catch { return false; } }
export const fluxo = (arquivo: string, inicio?: number, fim?: number) => createReadStream(caminho(arquivo), { start: inicio, end: fim });

export class LimiteExcedido extends Error { constructor() { super("Arquivo grande demais."); } }

/**
 * Grava um corpo em fluxo (sem carregar tudo na memória), calculando SHA-256 e tamanho.
 * Guarda os primeiros bytes para detecção de tipo. Aborta e apaga o parcial se passar do limite.
 */
export async function gravarFluxo(corpo: ReadableStream<Uint8Array>, maxBytes: number): Promise<{ arquivo: string; tamanho: number; sha256: string; cabecalho: Uint8Array }> {
  const arquivo = randomBytes(16).toString("hex");
  const destino = caminho(arquivo);
  await mkdir(path.dirname(destino), { recursive: true, mode: 0o700 });
  const parcial = `${destino}.parcial`;
  const out = createWriteStream(parcial, { mode: 0o600, flags: "wx" });
  const hash = createHash("sha256");
  const cab: Buffer[] = []; let cabLen = 0, total = 0;
  const reader = corpo.getReader();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.length;
      if (total > maxBytes) throw new LimiteExcedido();
      hash.update(value);
      if (cabLen < 65536) { const parte = Buffer.from(value.subarray(0, 65536 - cabLen)); cab.push(parte); cabLen += parte.length; }
      if (!out.write(value)) await new Promise<void>((r) => out.once("drain", () => r()));
    }
    await new Promise<void>((res, rej) => { out.once("error", rej); out.end(() => res()); });
    await rename(parcial, destino);
    return { arquivo, tamanho: total, sha256: hash.digest("hex"), cabecalho: new Uint8Array(Buffer.concat(cab)) };
  } catch (e) {
    out.destroy();
    try { await unlink(parcial); } catch { /* já removido */ }
    throw e;
  }
}
