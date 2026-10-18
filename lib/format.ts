const dtf = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric" });
export const formatDate = (d: Date | string | null) => {
  if (!d) return "—";
  if (typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d)) return d.split("-").reverse().join("/"); // DATE puro: sem fuso
  return dtf.format(typeof d === "string" ? new Date(d) : d);
};
const tf = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
export const formatTime = (d: Date) => tf.format(d);
const dtt = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
export const formatDateTime = (d: Date | string | null) => (d ? dtt.format(typeof d === "string" ? new Date(d) : d).replace(",", " às") : "—");

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1).replace(".", ",")} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2).replace(".", ",")} GB`;
}
export const formatNumber = (n: number | null | undefined) => (n == null ? "—" : new Intl.NumberFormat("pt-BR").format(n));
