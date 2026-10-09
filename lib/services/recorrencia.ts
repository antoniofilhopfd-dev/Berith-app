import { addDays, addMonths, localToUtc, utcToLocal, TZ } from "@/lib/time";

export type Recurrence = "nenhuma" | "semanal" | "mensal";
export type EventBase = { inicio: Date; fim: Date | null; recorrencia: Recurrence; recorrencia_ate: string | Date | null };
export type Occurrence = { date: string; inicio: Date; fim: Date | null };

const MAX_OCORRENCIAS = 800;
const asDate = (v: string | Date | null) => (v == null ? null : typeof v === "string" ? v.slice(0, 10) : v.toISOString().slice(0, 10));

/** Expande as ocorrências de um evento (possivelmente recorrente) que intersectam [from, to]. */
export function occurrences(ev: EventBase, from: Date, to: Date, tz = TZ): Occurrence[] {
  const base = utcToLocal(ev.inicio, tz);
  const dur = ev.fim ? ev.fim.getTime() - ev.inicio.getTime() : null;
  const make = (date: string): Occurrence => {
    const inicio = date === base.date ? ev.inicio : localToUtc(date, base.time, tz);
    return { date, inicio, fim: dur == null ? null : new Date(inicio.getTime() + dur) };
  };
  const hit = (o: Occurrence) => (o.fim ?? o.inicio).getTime() >= from.getTime() && o.inicio.getTime() <= to.getTime();
  if (ev.recorrencia === "nenhuma") {
    const o = make(base.date);
    return hit(o) ? [o] : [];
  }
  const ate = asDate(ev.recorrencia_ate);
  const out: Occurrence[] = [];
  for (let k = 0; k < MAX_OCORRENCIAS; k++) {
    let date: string;
    if (ev.recorrencia === "semanal") date = addDays(base.date, 7 * k);
    else {
      const r = addMonths(base.date, k);
      if (!r.ok) continue; // mês sem esse dia (ex.: 31)
      date = r.date;
    }
    if (ate && date > ate) break;
    const o = make(date);
    if (o.inicio.getTime() > to.getTime()) break;
    if (hit(o)) out.push(o);
  }
  return out;
}

export const isOccurrence = (ev: EventBase, date: string, tz = TZ) =>
  occurrences(ev, localToUtc(date, "00:00", tz), localToUtc(addDays(date, 1), "00:00", tz), tz).some((o) => o.date === date);
