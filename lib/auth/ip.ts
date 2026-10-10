/**
 * IP do cliente a partir dos cabeçalhos de proxy. O proxy da hospedagem ANEXA o endereço real ao final de
 * X-Forwarded-For; o início da lista é controlado pelo cliente (forjável). Por isso usamos o ÚLTIMO item.
 */
export function ipDe(get: (nome: string) => string | null): string {
  const xff = get("x-forwarded-for");
  const candidatos = [xff?.split(",").pop(), get("x-real-ip")].map((v) => v?.trim()).filter((v): v is string => Boolean(v));
  const ip = candidatos.find((v) => /^[0-9a-fA-F:.]{3,45}$/.test(v));
  return ip ?? "0.0.0.0";
}
