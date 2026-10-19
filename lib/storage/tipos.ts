/** Detecta o tipo REAL pela assinatura binária; ignora nome e Content-Type enviados pelo cliente. */
export type TipoMidia = { mime: string; ext: string; tipo: "imagem" | "video" };

const T = {
  jpg: { mime: "image/jpeg", ext: "jpg", tipo: "imagem" },
  png: { mime: "image/png", ext: "png", tipo: "imagem" },
  webp: { mime: "image/webp", ext: "webp", tipo: "imagem" },
  mp4: { mime: "video/mp4", ext: "mp4", tipo: "video" },
  mov: { mime: "video/quicktime", ext: "mov", tipo: "video" },
  webm: { mime: "video/webm", ext: "webm", tipo: "video" },
} as const satisfies Record<string, TipoMidia>;

export const LIMITE_IMAGEM_MB = 15;
export const limiteVideoMB = () => Math.min(1024, Math.max(10, Number(process.env.MAX_VIDEO_MB ?? 200) || 200));
export const limiteMB = (t: TipoMidia) => (t.tipo === "imagem" ? LIMITE_IMAGEM_MB : limiteVideoMB());
/** Maior arquivo aceito (usado para recusar cedo pelo Content-Length). */
export const MAX_BYTES = () => limiteVideoMB() * 1024 * 1024;
export const EXTENSOES_ACEITAS = "JPG, PNG, WebP, MP4, MOV ou WebM";

const ascii = (b: Uint8Array, i: number, s: string) => s.length + i <= b.length && s.split("").every((c, k) => b[i + k] === c.charCodeAt(0));

export function detectarMidia(b: Uint8Array): TipoMidia | null {
  if (b.length < 12) return null;
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return T.jpg;
  if (b[0] === 0x89 && ascii(b, 1, "PNG") && b[4] === 0x0d && b[5] === 0x0a) return T.png;
  if (ascii(b, 0, "RIFF") && ascii(b, 8, "WEBP")) return T.webp;
  if (ascii(b, 4, "ftyp")) return ascii(b, 8, "qt  ") ? T.mov : /^(isom|iso2|iso4|iso5|iso6|mp41|mp42|avc1|M4V |dash|MSNV|3gp)/.test(String.fromCharCode(...b.slice(8, 12))) ? T.mp4 : null;
  if (b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3) return T.webm;
  return null;
}

/** Largura/altura de imagens a partir do início do arquivo (PNG, JPEG, WebP). Null se não for possível. */
export function dimensoesImagem(b: Uint8Array): { largura: number; altura: number } | null {
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  try {
    if (b[0] === 0x89 && ascii(b, 1, "PNG")) return { largura: dv.getUint32(16), altura: dv.getUint32(20) };
    if (b[0] === 0xff && b[1] === 0xd8) {
      let i = 2;
      while (i + 9 < b.length) {
        if (b[i] !== 0xff) { i++; continue; }
        const m = b[i + 1];
        if (m === 0xd8 || m === 0x01 || (m >= 0xd0 && m <= 0xd7)) { i += 2; continue; }
        const len = dv.getUint16(i + 2);
        if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return { altura: dv.getUint16(i + 5), largura: dv.getUint16(i + 7) };
        i += 2 + len;
      }
      return null;
    }
    if (ascii(b, 0, "RIFF") && ascii(b, 8, "WEBP")) {
      if (ascii(b, 12, "VP8X")) return { largura: 1 + (b[24] | (b[25] << 8) | (b[26] << 16)), altura: 1 + (b[27] | (b[28] << 8) | (b[29] << 16)) };
      if (ascii(b, 12, "VP8 ")) return { largura: dv.getUint16(26, true) & 0x3fff, altura: dv.getUint16(28, true) & 0x3fff };
      if (ascii(b, 12, "VP8L")) { const v = dv.getUint32(21, true); return { largura: (v & 0x3fff) + 1, altura: ((v >> 14) & 0x3fff) + 1 }; }
    }
  } catch { /* cabeçalho incompleto */ }
  return null;
}

/** Nome seguro para exibir/baixar: remove caminhos e caracteres de controle. */
export function nomeSeguro(nome: string, ext: string): string {
  const base = nome.split(/[\\/]/).pop() ?? "arquivo";
  const limpo = base.replace(/[\u0000-\u001f\u007f"<>:|?*]/g, "").replace(/\.[^.]*$/, "").trim().slice(0, 120) || "arquivo";
  return `${limpo}.${ext}`;
}

/** Intervalo HTTP Range ("bytes=0-99"); necessário para reproduzir vídeo no Safari/iPhone. */
export function lerRange(header: string | null, tamanho: number): { inicio: number; fim: number } | "invalido" | null {
  if (!header) return null;
  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!m || (m[1] === "" && m[2] === "")) return "invalido";
  let inicio: number, fim: number;
  if (m[1] === "") { const n = Number(m[2]); if (n === 0) return "invalido"; inicio = Math.max(tamanho - n, 0); fim = tamanho - 1; }
  else { inicio = Number(m[1]); fim = m[2] === "" ? tamanho - 1 : Math.min(Number(m[2]), tamanho - 1); }
  if (!Number.isSafeInteger(inicio) || !Number.isSafeInteger(fim) || inicio > fim || inicio >= tamanho) return "invalido";
  return { inicio, fim };
}
