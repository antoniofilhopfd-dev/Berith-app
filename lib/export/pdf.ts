import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";

export type TabelaPdf = { titulo: string; colunas: { rotulo: string; largura: number; alinhar?: "esq" | "dir" }[]; linhas: string[][] };
export type DocumentoPdf = { titulo: string; subtitulo: string; notas?: string[]; tabelas: TabelaPdf[] };

/** As fontes padrão do PDF só cobrem WinAnsi (Latin-1): troca o que não couber por "?" para nunca falhar. */
const seguro = (s: string) => Array.from(s.normalize("NFC")).map((c) => (c.charCodeAt(0) <= 0xff && c.charCodeAt(0) >= 0x20) || c === "\n" ? c : c === "–" || c === "—" ? "-" : c === "•" ? "·" : c === "“" || c === "”" ? '"' : c === "‘" || c === "’" ? "'" : "?").join("").replace(/\n/g, " ");

function cortar(texto: string, fonte: PDFFont, tam: number, largura: number): string {
  let t = seguro(texto);
  if (fonte.widthOfTextAtSize(t, tam) <= largura) return t;
  while (t.length > 1 && fonte.widthOfTextAtSize(t + "...", tam) > largura) t = t.slice(0, -1);
  return t + "...";
}

export async function gerarPdf(doc: DocumentoPdf): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(seguro(doc.titulo)); pdf.setCreator("Berith-app");
  const fonte = await pdf.embedFont(StandardFonts.Helvetica), negrito = await pdf.embedFont(StandardFonts.HelveticaBold);
  const L = 595.28, A = 841.89, M = 40, verde = rgb(0.27, 0.35, 0.27);
  let pagina: PDFPage = pdf.addPage([L, A]); let y = A - M;
  const nova = () => { pagina = pdf.addPage([L, A]); y = A - M; };
  const garantir = (h: number) => { if (y - h < M + 20) nova(); };

  pagina.drawText(seguro(doc.titulo), { x: M, y: y - 16, size: 16, font: negrito, color: verde }); y -= 26;
  pagina.drawText(cortar(doc.subtitulo, fonte, 10, L - 2 * M), { x: M, y: y - 10, size: 10, font: fonte, color: rgb(0.3, 0.3, 0.3) }); y -= 22;
  for (const n of doc.notas ?? []) { garantir(14); pagina.drawText(cortar(n, fonte, 8.5, L - 2 * M), { x: M, y: y - 9, size: 8.5, font: fonte, color: rgb(0.35, 0.35, 0.35) }); y -= 12; }
  y -= 8;

  for (const t of doc.tabelas) {
    const soma = t.colunas.reduce((s, c) => s + c.largura, 0), esc = (L - 2 * M) / soma;
    garantir(50);
    pagina.drawText(seguro(t.titulo), { x: M, y: y - 11, size: 11, font: negrito, color: verde }); y -= 20;
    const cabecalho = () => {
      let x = M;
      pagina.drawRectangle({ x: M, y: y - 13, width: L - 2 * M, height: 15, color: rgb(0.93, 0.95, 0.92) });
      for (const c of t.colunas) { const w = c.largura * esc; pagina.drawText(cortar(c.rotulo, negrito, 8, w - 4), { x: x + 2, y: y - 9, size: 8, font: negrito }); x += w; }
      y -= 16;
    };
    cabecalho();
    for (const linha of t.linhas) {
      if (y - 14 < M + 20) { nova(); cabecalho(); }
      let x = M;
      t.colunas.forEach((c, i) => {
        const w = c.largura * esc, txt = cortar(linha[i] ?? "", fonte, 8, w - 4);
        const dx = c.alinhar === "dir" ? w - 2 - fonte.widthOfTextAtSize(txt, 8) : 2;
        pagina.drawText(txt, { x: x + dx, y: y - 9, size: 8, font: fonte }); x += w;
      });
      pagina.drawLine({ start: { x: M, y: y - 12 }, end: { x: L - M, y: y - 12 }, thickness: 0.3, color: rgb(0.85, 0.85, 0.85) });
      y -= 14;
    }
    y -= 12;
  }
  const paginas = pdf.getPages();
  paginas.forEach((p, i) => p.drawText(`Berith-app · Ministério de Comunicação · página ${i + 1} de ${paginas.length}`, { x: M, y: 22, size: 7.5, font: fonte, color: rgb(0.5, 0.5, 0.5) }));
  return pdf.save();
}
