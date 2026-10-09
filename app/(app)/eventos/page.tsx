import Link from "next/link";
import { requireUser } from "@/lib/auth/session";
import { creationTargets, listOccurrences } from "@/lib/services/eventos";
import { DIAS_CURTOS, MESES, addDays, addMonths, isDate, localToUtc, todayLocal } from "@/lib/time";
import { Card, Empty } from "@/components/ui";
import { OcorrenciaItem, agruparPorDia, tituloDia } from "@/components/evento-ui";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";

type SP = { v?: string; d?: string };

function Abas({ v, d }: { v: string; d: string }) {
  const abas = [["lista", "Lista"], ["semana", "Semana"], ["mes", "Mês"]];
  return (
    <div role="tablist" className="flex gap-1 overflow-x-auto rounded-xl bg-verde/10 p-1">
      {abas.map(([k, l]) => (
        <Link key={k} role="tab" aria-selected={v === k} href={`?v=${k}&d=${d}`}
          className={`min-h-11 flex-1 content-center rounded-lg px-3 text-center text-sm ${v === k ? "bg-verde text-white" : "text-verde"}`}>{l}</Link>
      ))}
    </div>
  );
}

export default async function Eventos({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const v = ["lista", "semana", "mes"].includes(sp.v ?? "") ? sp.v! : "lista";
  const hoje = todayLocal();
  const d = sp.d && isDate(sp.d) ? sp.d : hoje;
  const alvos = await creationTargets(user.id);
  const podeCriar = alvos.comunidade || alvos.unidades === "todas" || alvos.unidades.length > 0;

  let from: string, to: string, titulo: string, prev: string, next: string;
  if (v === "mes") {
    const [y, m] = d.split("-");
    const primeiro = `${y}-${m}-01`;
    from = addDays(primeiro, -new Date(primeiro + "T12:00:00Z").getUTCDay());
    to = addDays(from, 41);
    titulo = `${MESES[+m - 1].charAt(0).toUpperCase()}${MESES[+m - 1].slice(1)} de ${y}`;
    prev = addMonths(primeiro, -1).date; next = addMonths(primeiro, 1).date;
  } else if (v === "semana") {
    from = addDays(d, -new Date(d + "T12:00:00Z").getUTCDay());
    to = addDays(from, 6);
    titulo = `${from.split("-").reverse().slice(0, 2).join("/")} a ${to.split("-").reverse().slice(0, 2).join("/")}`;
    prev = addDays(d, -7); next = addDays(d, 7);
  } else {
    from = d; to = addDays(d, 59);
    titulo = "Próximos 60 dias";
    prev = addDays(d, -60); next = addDays(d, 60);
  }
  const ocs = await listOccurrences(user.id, localToUtc(from, "00:00"), localToUtc(addDays(to, 1), "00:00"));
  const grupos = agruparPorDia(ocs);
  const porDia = new Map(grupos);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="font-titulo text-2xl text-verde">Agenda</h1>
        {podeCriar && (
          <Link href="/eventos/novo" className="inline-flex min-h-11 items-center gap-1 rounded-lg bg-verde px-3 text-sm text-white"><Plus size={16} aria-hidden /> Novo evento</Link>
        )}
      </div>
      <Abas v={v} d={d} />
      <div className="flex items-center justify-between">
        <Link href={`?v=${v}&d=${prev}`} aria-label="Anterior" className="flex min-h-11 min-w-11 items-center justify-center text-verde"><ChevronLeft /></Link>
        <div className="text-center">
          <p className="font-medium">{titulo}</p>
          {d !== hoje && <Link href={`?v=${v}`} className="text-xs text-verde underline">Ir para hoje</Link>}
        </div>
        <Link href={`?v=${v}&d=${next}`} aria-label="Próximo" className="flex min-h-11 min-w-11 items-center justify-center text-verde"><ChevronRight /></Link>
      </div>

      {v === "mes" && (
        <Card className="p-2">
          <div className="grid grid-cols-7 text-center text-xs text-tinta/60">{DIAS_CURTOS.map((x) => <span key={x} className="py-1">{x}</span>)}</div>
          <div className="grid grid-cols-7 gap-px">
            {Array.from({ length: 42 }, (_, i) => addDays(from, i)).map((dia) => {
              const doMes = dia.slice(0, 7) === d.slice(0, 7);
              const n = porDia.get(dia)?.length ?? 0;
              return (
                <Link key={dia} href={`?v=semana&d=${dia}`} aria-label={`${dia}: ${n} evento(s)`}
                  className={`flex min-h-12 flex-col items-center rounded-lg pt-1 text-sm ${doMes ? "" : "text-tinta/30"} ${dia === hoje ? "bg-verde text-white" : ""}`}>
                  {+dia.slice(8)}
                  {n > 0 && <span className={`mt-0.5 rounded-full px-1.5 text-[10px] ${dia === hoje ? "bg-white text-verde" : "bg-cobre/30 text-verde"}`}>{n}</span>}
                </Link>
              );
            })}
          </div>
        </Card>
      )}

      {v === "semana"
        ? Array.from({ length: 7 }, (_, i) => addDays(from, i)).map((dia) => (
            <Card key={dia} title={`${tituloDia(dia)}${dia === hoje ? " · hoje" : ""}`}>
              {porDia.get(dia) ? <ul className="divide-y divide-borda">{porDia.get(dia)!.map((o) => <OcorrenciaItem key={o.evento.id + o.date} o={o} />)}</ul> : <Empty>Sem eventos.</Empty>}
            </Card>
          ))
        : grupos.length === 0
          ? <Card><Empty>Nenhum evento neste período.</Empty></Card>
          : grupos.filter(([dia]) => v === "lista" || dia.slice(0, 7) === d.slice(0, 7)).map(([dia, itens]) => (
              <Card key={dia} title={`${tituloDia(dia)}${dia === hoje ? " · hoje" : ""}`}>
                <ul className="divide-y divide-borda">{itens.map((o) => <OcorrenciaItem key={o.evento.id + o.date} o={o} />)}</ul>
              </Card>
            ))}
    </div>
  );
}
