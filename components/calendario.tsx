"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ActionForm, Field, inputCls } from "./action-form";
import { corDoFormato } from "./pub-ui";
import { FORMATOS_ATIVOS, FORMATO_ROTULO, REDES_ATIVAS, REDE_ROTULO, STATUS_ROTULO, type Formato, type Rede, type Status } from "@/lib/editorial";
import type { Visao } from "@/lib/calendario";
import { DIAS, DIAS_CURTOS, brDate } from "@/lib/time";
import type { FormAction } from "@/lib/auth/guard";

export type ItemCal = { id: number; titulo: string; formato: Formato; status: Status; hora: string; redes: Rede[]; responsavel: string | null; trecho: string; corCampanha: string | null; podeMover: boolean };
export type DiaCal = { data: string; itens: ItemCal[]; datas: string[]; foraDoMes: boolean };

const SIGLA: Record<Rede, string> = { instagram: "IG", facebook: "FB", tiktok: "TT", youtube: "YT" };
const COR_STATUS: Record<Status, string> = { rascunho: "#9aa0a6", em_producao: "#3f6f8f", em_revisao: "#c99700", ajustes_solicitados: "#b07840", aprovado: "#587458", agendado: "#2f7d4f", publicado: "#445a44", cancelado: "#b3261e" };

export function Calendario({ visao, dias, hoje, podeCriar, mover, criarRapida }: {
  visao: Visao; dias: DiaCal[]; hoje: string; podeCriar: boolean;
  mover: (id: number, dia: string) => Promise<{ erro?: string }>; criarRapida: FormAction;
}) {
  const router = useRouter();
  const [, iniciar] = useTransition();
  const [arrastando, setArrastando] = useState<number | null>(null);
  const [sobre, setSobre] = useState<string | null>(null);
  const [aviso, setAviso] = useState<{ tipo: "erro" | "ok"; msg: string } | null>(null);
  const [detalhe, setDetalhe] = useState<ItemCal | null>(null);
  const [novoDia, setNovoDia] = useState<string | null>(null);
  const [moveData, setMoveData] = useState("");

  async function soltar(dia: string, id: number) {
    setSobre(null); setArrastando(null);
    const origem = dias.find((d) => d.itens.some((i) => i.id === id));
    if (!origem || origem.data === dia) return;
    const r = await mover(id, dia);
    if (r.erro) setAviso({ tipo: "erro", msg: r.erro }); else { setAviso({ tipo: "ok", msg: `Movida para ${brDate(dia)}.` }); iniciar(() => router.refresh()); }
  }

  const item = (it: ItemCal, compacto?: boolean) => (
    <li key={it.id}>
      <button type="button" draggable={it.podeMover} onDragStart={(e) => { setArrastando(it.id); e.dataTransfer.setData("text/plain", String(it.id)); e.dataTransfer.effectAllowed = "move"; }} onDragEnd={() => { setArrastando(null); setSobre(null); }}
        onClick={() => { setDetalhe(it); setMoveData(dias.find((d) => d.itens.includes(it))?.data ?? ""); }}
        className={`flex w-full items-center gap-1 rounded border border-borda bg-white px-1.5 py-1 text-left text-[11px] leading-tight hover:border-verde focus-visible:outline-2 ${arrastando === it.id ? "opacity-40" : ""} ${it.podeMover ? "cursor-grab" : ""}`}
        style={{ borderLeft: `4px solid ${it.corCampanha ?? corDoFormato(it.formato)}` }} aria-label={`${it.titulo}, ${FORMATO_ROTULO[it.formato]}, ${STATUS_ROTULO[it.status]}, ${it.hora}`}>
        <span aria-hidden className="h-2 w-2 shrink-0 rounded-full" style={{ background: COR_STATUS[it.status] }} />
        <span className="shrink-0 tabular-nums text-tinta/60">{it.hora}</span>
        <span className="min-w-0 flex-1 truncate font-medium">{it.titulo}</span>
        {!compacto && <span className="shrink-0 text-[9px] font-bold text-tinta/50">{it.redes.map((r) => SIGLA[r]).join(" ")}</span>}
      </button>
    </li>
  );

  const celula = (d: DiaCal, alto: string) => (
    <div key={d.data} onDragOver={(e) => { if (arrastando) { e.preventDefault(); setSobre(d.data); } }} onDragLeave={() => setSobre((s) => (s === d.data ? null : s))}
      onDrop={(e) => { e.preventDefault(); soltar(d.data, Number(e.dataTransfer.getData("text/plain") || arrastando)); }}
      className={`group relative border-b border-r border-borda p-1 ${alto} ${d.foraDoMes ? "bg-borda/20" : "bg-white"} ${sobre === d.data ? "bg-verde/10 ring-2 ring-inset ring-verde" : ""}`}
      aria-label={`${DIAS[new Date(d.data + "T12:00:00Z").getUTCDay()]}, ${brDate(d.data)}${d.data === hoje ? " (hoje)" : ""}`}>
      <div className="flex items-center justify-between">
        <span className={`inline-flex h-6 min-w-6 items-center justify-center rounded-full px-1 text-xs ${d.data === hoje ? "bg-verde font-bold text-white" : d.foraDoMes ? "text-tinta/40" : "text-tinta"}`}>{Number(d.data.slice(8))}</span>
        {podeCriar && <button type="button" onClick={() => setNovoDia(d.data)} aria-label={`Criar produção em ${brDate(d.data)}`} className="flex h-6 w-6 items-center justify-center rounded text-tinta/40 opacity-0 hover:bg-verde/10 hover:text-verde focus-visible:opacity-100 group-hover:opacity-100">+</button>}
      </div>
      {d.datas.map((n) => <p key={n} className="mt-0.5 truncate rounded bg-cobre/15 px-1 text-[10px] text-marrom" title={n}>{n}</p>)}
      <ul className="mt-0.5 space-y-0.5">{d.itens.slice(0, visao === "mes" ? 3 : 20).map((it) => item(it, visao === "mes"))}</ul>
      {visao === "mes" && d.itens.length > 3 && <Link href={`?view=dia&d=${d.data}`} className="mt-0.5 block text-[10px] text-verde-escuro underline">+{d.itens.length - 3} mais</Link>}
    </div>
  );

  const dlgDetalhe = useRef<HTMLDialogElement>(null), dlgNovo = useRef<HTMLDialogElement>(null);
  useEffect(() => { if (detalhe) dlgDetalhe.current?.showModal(); }, [detalhe]);
  useEffect(() => { if (novoDia) dlgNovo.current?.showModal(); }, [novoDia]);

  return (
    <div>
      {aviso && <p role={aviso.tipo === "erro" ? "alert" : "status"} className={`mb-3 rounded-lg px-3 py-2 text-sm ${aviso.tipo === "erro" ? "bg-red-50 text-red-800" : "bg-green-50 text-green-800"}`}>{aviso.msg}</p>}

      {/* Telas largas: grade */}
      <div className="hidden overflow-hidden rounded-xl border-l border-t border-borda md:block">
        {visao !== "dia" && <div className={`grid grid-cols-7 bg-fundo text-center text-xs font-semibold uppercase text-tinta/60`}>{DIAS_CURTOS.map((d) => <div key={d} className="border-b border-r border-borda py-1">{d}</div>)}</div>}
        <div className={visao === "dia" ? "" : "grid grid-cols-7"}>{dias.map((d) => celula(d, visao === "mes" ? "min-h-28" : visao === "semana" ? "min-h-64" : "min-h-72"))}</div>
      </div>

      {/* Celular: agenda por dia */}
      <ol className="space-y-2 md:hidden" aria-label="Agenda do período">
        {dias.filter((d) => !d.foraDoMes || d.itens.length || d.datas.length).map((d) => (
          <li key={d.data} className={`rounded-xl border bg-white p-3 ${d.data === hoje ? "border-verde" : "border-borda"}`}>
            <div className="mb-1 flex items-center justify-between"><p className="text-sm font-semibold">{DIAS[new Date(d.data + "T12:00:00Z").getUTCDay()]}, {brDate(d.data).slice(0, 5)}{d.data === hoje && <span className="ml-2 rounded bg-verde px-1.5 text-[10px] font-normal text-white">hoje</span>}</p>
              {podeCriar && <button type="button" onClick={() => setNovoDia(d.data)} aria-label={`Criar produção em ${brDate(d.data)}`} className="min-h-10 min-w-10 rounded-lg border border-borda text-lg">+</button>}</div>
            {d.datas.map((n) => <p key={n} className="mb-1 rounded bg-cobre/15 px-2 py-0.5 text-xs text-marrom">{n}</p>)}
            {d.itens.length === 0 ? (d.datas.length === 0 && <p className="text-xs text-tinta/50">Sem publicações</p>) : <ul className="space-y-1">{d.itens.map((it) => item(it))}</ul>}
          </li>
        ))}
      </ol>

      <dialog ref={dlgDetalhe} onClose={() => setDetalhe(null)} aria-labelledby="det-titulo" className="m-auto w-[min(92vw,460px)] rounded-xl border border-borda p-0 backdrop:bg-black/40">
        {detalhe && (
          <div className="space-y-3 p-4">
            <div className="flex items-start justify-between gap-2"><h2 id="det-titulo" className="text-base font-semibold">{detalhe.titulo}</h2><button type="button" onClick={() => dlgDetalhe.current?.close()} aria-label="Fechar" className="min-h-10 min-w-10 rounded-lg hover:bg-fundo">✕</button></div>
            <p className="text-sm text-tinta/70">{FORMATO_ROTULO[detalhe.formato]} · {STATUS_ROTULO[detalhe.status]} · {detalhe.hora}<br />{detalhe.redes.map((r) => REDE_ROTULO[r]).join(", ")} · {detalhe.responsavel ?? "sem responsável"}</p>
            {detalhe.trecho && <p className="line-clamp-4 whitespace-pre-line rounded bg-fundo p-2 text-xs">{detalhe.trecho}</p>}
            <div className="flex flex-wrap items-end gap-2">
              <Link href={`/producao/${detalhe.id}`} className="inline-flex min-h-10 items-center rounded-lg bg-verde px-4 text-sm text-white">Abrir</Link>
              {detalhe.podeMover && (
                <form className="flex items-end gap-2" onSubmit={async (e) => { e.preventDefault(); if (!moveData) return; const r = await mover(detalhe.id, moveData); dlgDetalhe.current?.close(); if (r.erro) setAviso({ tipo: "erro", msg: r.erro }); else { setAviso({ tipo: "ok", msg: `Movida para ${brDate(moveData)}.` }); iniciar(() => router.refresh()); } }}>
                  <label className="text-xs">Mover para<input type="date" value={moveData} onChange={(e) => setMoveData(e.target.value)} className="mt-1 block min-h-10 rounded-lg border border-borda px-2 text-sm" /></label>
                  <button className="min-h-10 rounded-lg border border-borda px-3 text-sm">Mover</button>
                </form>
              )}
            </div>
          </div>
        )}
      </dialog>

      <dialog ref={dlgNovo} onClose={() => setNovoDia(null)} aria-labelledby="novo-titulo" className="m-auto w-[min(92vw,460px)] rounded-xl border border-borda p-0 backdrop:bg-black/40">
        {novoDia && (
          <div className="space-y-3 p-4">
            <div className="flex items-start justify-between gap-2"><h2 id="novo-titulo" className="text-base font-semibold">Nova produção em {brDate(novoDia)}</h2><button type="button" onClick={() => dlgNovo.current?.close()} aria-label="Fechar" className="min-h-10 min-w-10 rounded-lg hover:bg-fundo">✕</button></div>
            <ActionForm action={criarRapida} submit="Criar e abrir">
              <input type="hidden" name="dia" value={novoDia} />
              <Field label="Título interno"><input name="titulo" required minLength={2} maxLength={160} autoFocus className={inputCls} /></Field>
              <Field label="Formato"><select name="formato" defaultValue="post" className={inputCls}>{FORMATOS_ATIVOS.map((f) => <option key={f} value={f}>{FORMATO_ROTULO[f]}</option>)}</select></Field>
              <fieldset className="flex flex-wrap gap-3"><legend className="mb-1 text-sm font-medium">Redes</legend>{REDES_ATIVAS.map((r) => <label key={r} className="flex items-center gap-1 text-sm"><input type="checkbox" name="redes" value={r} defaultChecked={r === "instagram"} className="h-4 w-4" />{REDE_ROTULO[r]}</label>)}</fieldset>
              <p className="text-xs text-tinta/60">Cria um rascunho com a data prevista. O restante você completa no editor.</p>
            </ActionForm>
          </div>
        )}
      </dialog>
    </div>
  );
}
