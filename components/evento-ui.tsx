import Link from "next/link";
import { formatTime } from "@/lib/format";
import { brDate, DIAS, utcToLocal } from "@/lib/time";
import type { Ocorrencia } from "@/lib/services/eventos";
import { Badge } from "./ui";

export function horario(o: { inicio: Date; fim: Date | null }) {
  return o.fim ? `${formatTime(o.inicio)} – ${formatTime(o.fim)}` : formatTime(o.inicio);
}

export function OcorrenciaItem({ o }: { o: Ocorrencia }) {
  const e = o.evento;
  return (
    <li>
      <Link href={`/eventos/${e.id}?d=${o.date}`} className="flex min-h-14 gap-3 py-2">
        <span className="w-14 shrink-0 pt-0.5 text-sm font-medium text-vinho">{formatTime(o.inicio)}</span>
        <span className="min-w-0 flex-1">
          <span className={`block font-medium ${o.cancelada ? "text-tinta/50 line-through" : ""}`}>{e.titulo}</span>
          <span className="block truncate text-xs text-tinta/60">{[e.local, e.unit_nome ?? "Toda a comunidade"].filter(Boolean).join(" · ")}</span>
          <span className="mt-1 flex flex-wrap gap-1">
            {o.cancelada && <Badge>cancelado</Badge>}
            {e.recorrencia !== "nenhuma" && <Badge>{e.recorrencia === "semanal" ? "toda semana" : "todo mês"}</Badge>}
            {o.meuStatus === "confirmado" && <Badge>você confirmou</Badge>}
            {e.limite_participantes != null && <Badge>{o.confirmados}/{e.limite_participantes} vagas</Badge>}
          </span>
        </span>
      </Link>
    </li>
  );
}

export function agruparPorDia(os: Ocorrencia[]) {
  const m = new Map<string, Ocorrencia[]>();
  for (const o of os) {
    const d = utcToLocal(o.inicio).date;
    m.set(d, [...(m.get(d) ?? []), o]);
  }
  return [...m.entries()];
}

const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
export const tituloDia = (date: string) => `${cap(DIAS[new Date(date + "T12:00:00Z").getUTCDay()])}, ${brDate(date)}`;
