import { addDays } from "@/lib/time";

export type Visao = "mes" | "semana" | "dia";
const dow = (d: string) => new Date(d + "T12:00:00Z").getUTCDay();

/** Início (domingo) da semana que contém `d`. */
export const inicioDaSemana = (d: string) => addDays(d, -dow(d));

/** Intervalo exibido [inicio, fim) e a lista de dias, conforme a visão. */
export function periodo(visao: Visao, ancora: string): { inicio: string; fim: string; dias: string[]; mesRef: string } {
  const mesRef = ancora.slice(0, 7);
  if (visao === "dia") return { inicio: ancora, fim: addDays(ancora, 1), dias: [ancora], mesRef };
  if (visao === "semana") {
    const i = inicioDaSemana(ancora);
    return { inicio: i, fim: addDays(i, 7), dias: Array.from({ length: 7 }, (_, k) => addDays(i, k)), mesRef };
  }
  const primeiro = `${mesRef}-01`;
  const i = inicioDaSemana(primeiro);
  const diasNoMes = new Date(Date.UTC(Number(mesRef.slice(0, 4)), Number(mesRef.slice(5, 7)), 0)).getUTCDate();
  const semanas = Math.ceil((dow(primeiro) + diasNoMes) / 7);
  return { inicio: i, fim: addDays(i, semanas * 7), dias: Array.from({ length: semanas * 7 }, (_, k) => addDays(i, k)), mesRef };
}

/** Âncora anterior/seguinte conforme a visão. */
export function navegar(visao: Visao, ancora: string, sentido: -1 | 1): string {
  if (visao === "dia") return addDays(ancora, sentido);
  if (visao === "semana") return addDays(ancora, 7 * sentido);
  const [a, m] = ancora.split("-").map(Number);
  const t = new Date(Date.UTC(a, m - 1 + sentido, 1, 12));
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, "0")}-01`;
}
