/** Valores em centavos inteiros. Nunca usa ponto flutuante para somar ou comparar. */
export const formatBRL = (centavos: number | bigint) => {
  const n = BigInt(centavos);
  const neg = n < 0n; const abs = neg ? -n : n;
  const reais = abs / 100n, cent = abs % 100n;
  return `${neg ? "-" : ""}R$ ${reais.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".")},${cent.toString().padStart(2, "0")}`;
};

/** "1.234,56" | "1234,5" | "1234" → 123456 | 123450 | 123400. Recusa ponto decimal ambíguo, negativos e zero. */
export function parseBRL(texto: string): number | null {
  const t = texto.trim().replace(/^R\$\s*/, "");
  if (!/^\d{1,3}(\.\d{3})*(,\d{1,2})?$|^\d+(,\d{1,2})?$/.test(t)) return null;
  const [inteiro, dec = ""] = t.replace(/\./g, "").split(",");
  const centavos = BigInt(inteiro) * 100n + BigInt(dec.padEnd(2, "0"));
  if (centavos <= 0n || centavos > 99_999_999_999n) return null; // até R$ 999.999.999,99
  return Number(centavos);
}
