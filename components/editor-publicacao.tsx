"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActionForm, Field, inputCls } from "./action-form";
import { UploadMidia } from "./upload-midia";
import { Previa, PreviaFeed, type MidiaPrev } from "./previas";
import { RedeTag } from "./pub-ui";
import type { FormAction } from "@/lib/auth/guard";
import {
  FORMATOS_ATIVOS, FORMATO_ROTULO, FORMATOS_POR_REDE, LIMITES, PRIORIDADES, PRIORIDADE_ROTULO, REDES_ATIVAS, REDE_ROTULO,
  contarCaracteres, normalizarHashtags, problemasDoConteudo, textoDaRede, type Formato, type Prioridade, type Rede,
} from "@/lib/editorial";

export type MidiaSel = { id: number; tipo: "imagem" | "video"; nome: string; largura: number | null; altura: number | null };
export type Opcao = { id: number; nome: string };
export type Inicial = {
  id: number | null; rev: number; status: string;
  titulo: string; descricao: string; objetivo: string; formato: Formato; redes: Rede[];
  campanhaId: number | null; editoriaId: number | null; responsavelId: number | null; prioridade: Prioridade;
  legenda: string; hashtags: string; referencias: string; observacoes: string;
  porRede: Partial<Record<Rede, { legenda: string; hashtags: string; titulo: string }>>;
  /** Conta (ig_id) de cada rede no envio; só o Instagram tem várias contas. */
  contaPorRede?: Partial<Record<Rede, string>>;
  prazoData: string; prazoHora: string; publicarData: string; publicarHora: string;
  midias: MidiaSel[];
};
type Resultado = { erro?: string; rev?: number; hora?: string };

export function EditorPublicacao({ inicial, campanhas, editorias, pessoas, conta, contas = {}, contasIg = [], recentes, salvar, autosalvar, somenteLeitura = false, hashtagsPadrao = "" }: {
  inicial: Inicial; campanhas: Opcao[]; editorias: Opcao[]; pessoas: Opcao[]; conta: string; contas?: Partial<Record<Rede, string>>; contasIg?: { igId: string; usuario: string }[]; recentes: MidiaPrev[];
  salvar: FormAction; autosalvar: ((fd: FormData) => Promise<Resultado>) | null; somenteLeitura?: boolean; hashtagsPadrao?: string;
}) {
  const [titulo, setTitulo] = useState(inicial.titulo);
  const [formato, setFormato] = useState<Formato>(inicial.formato);
  const [redes, setRedes] = useState<Rede[]>(inicial.redes);
  const [legenda, setLegenda] = useState(inicial.legenda);
  const [hashtags, setHashtags] = useState(inicial.hashtags);
  const [porRede, setPorRede] = useState(inicial.porRede);
  const [midias, setMidias] = useState<MidiaSel[]>(inicial.midias);
  const [ativa, setAtiva] = useState<Rede | "feed">(inicial.redes[0] ?? "instagram");
  const [seletor, setSeletor] = useState(false);
  const [rev, setRev] = useState(inicial.rev);
  const [auto, setAuto] = useState<{ tipo: "ok" | "erro" | "salvando" | "idle"; msg: string }>({ tipo: "idle", msg: "" });
  const formRef = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const sujo = useRef(false);

  const setRede = (r: Rede, campo: "legenda" | "hashtags" | "titulo", v: string) => setPorRede((p) => ({ ...p, [r]: { legenda: "", hashtags: "", titulo: "", ...p[r], [campo]: v } }));
  const alternarRede = (r: Rede) => setRedes((a) => (a.includes(r) ? a.filter((x) => x !== r) : REDES_ATIVAS.filter((x) => a.includes(x) || x === r)));

  const dadosConteudo = useMemo(() => ({
    titulo, formato, legenda: legenda || null, hashtags: hashtags || null,
    redes: redes.map((r) => ({ rede: r, legenda: porRede[r]?.legenda || null, hashtags: porRede[r]?.hashtags || null, tituloExterno: porRede[r]?.titulo || null })),
    midias: midias.map((m) => ({ id: m.id, tipo: m.tipo, largura: m.largura, altura: m.altura })),
  }), [titulo, formato, legenda, hashtags, redes, porRede, midias]);
  const pendencias = useMemo(() => problemasDoConteudo(dadosConteudo), [dadosConteudo]);

  const prevDados = (r: Rede) => ({
    conta, formato, titulo: porRede[r]?.titulo || titulo, midias: midias.map((m) => ({ id: m.id, tipo: m.tipo, nome: m.nome })),
    texto: textoDaRede({ legenda, hashtags }, { legenda: porRede[r]?.legenda || null, hashtags: porRede[r]?.hashtags || null }),
  });

  // Salvamento automático (somente em rascunhos/produção; nunca invalida aprovações sem querer).
  const agendarAuto = useCallback(() => {
    if (!autosalvar || somenteLeitura) return;
    sujo.current = true;
    clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      const raiz = formRef.current?.closest("form");
      if (!raiz || !sujo.current) return;
      const fd = new FormData(raiz as HTMLFormElement);
      fd.set("rev", String(rev));
      setAuto({ tipo: "salvando", msg: "Salvando…" });
      const r = await autosalvar(fd).catch(() => ({ erro: "Sem conexão." } as Resultado));
      if (r.erro) setAuto({ tipo: "erro", msg: `Não salvou automaticamente: ${r.erro}` });
      else { sujo.current = false; if (r.rev != null) setRev(r.rev); setAuto({ tipo: "ok", msg: `Salvo automaticamente às ${r.hora}` }); }
    }, 2500);
  }, [autosalvar, somenteLeitura, rev]);
  useEffect(() => () => clearTimeout(timer.current), []);

  const limiteMin = redes.length ? Math.min(...redes.map((r) => LIMITES[r].legenda)) : 2200;
  const usados = contarCaracteres(textoDaRede({ legenda, hashtags }, {}));
  const formatosPossiveis = FORMATOS_ATIVOS.filter((f) => redes.length === 0 || redes.every((r) => FORMATOS_POR_REDE[r].includes(f)));

  return (
    <ActionForm action={salvar} submit={inicial.id ? "Salvar alterações" : "Criar como rascunho"} resetOnOk={false} className="space-y-0">
      <div ref={formRef} onChange={agendarAuto} onInput={agendarAuto} className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-5">
          {inicial.id && <input type="hidden" name="id" value={inicial.id} />}
          <input type="hidden" name="rev" value={rev} />
          <input type="hidden" name="midiaIds" value={midias.map((m) => m.id).join(",")} />
          <fieldset disabled={somenteLeitura} className="space-y-5 disabled:opacity-80">
            <section aria-labelledby="sec-detalhes" className="space-y-3 rounded-xl border border-borda bg-cartao p-4">
              <h2 id="sec-detalhes" className="text-sm font-semibold uppercase tracking-wide text-tinta/70">Detalhes</h2>
              <Field label="Título interno"><input name="titulo" required minLength={2} maxLength={160} value={titulo} onChange={(e) => setTitulo(e.target.value)} className={inputCls} /></Field>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Formato">
                  <select name="formato" value={formato} onChange={(e) => setFormato(e.target.value as Formato)} className={inputCls}>
                    {FORMATOS_ATIVOS.map((f) => <option key={f} value={f} disabled={!formatosPossiveis.includes(f) && f !== formato}>{FORMATO_ROTULO[f]}</option>)}
                  </select>
                </Field>
                <Field label="Prioridade"><select name="prioridade" defaultValue={inicial.prioridade} className={inputCls}>{PRIORIDADES.map((p) => <option key={p} value={p}>{PRIORIDADE_ROTULO[p]}</option>)}</select></Field>
              </div>
              <Field label="Objetivo da publicação"><input name="objetivo" maxLength={300} defaultValue={inicial.objetivo} placeholder="Ex.: convidar para o retiro de Advento" className={inputCls} /></Field>
              <Field label="Descrição (briefing interno)"><textarea name="descricao" rows={3} maxLength={5000} defaultValue={inicial.descricao} className={inputCls + " py-2"} /></Field>
              <div className="grid gap-3 sm:grid-cols-3">
                <Field label="Responsável"><select name="responsavelId" defaultValue={inicial.responsavelId ?? ""} className={inputCls}><option value="">—</option>{pessoas.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}</select></Field>
                <Field label="Campanha"><select name="campanhaId" defaultValue={inicial.campanhaId ?? ""} className={inputCls}><option value="">Nenhuma</option>{campanhas.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}</select></Field>
                <Field label="Editoria"><select name="editoriaId" defaultValue={inicial.editoriaId ?? ""} className={inputCls}><option value="">Nenhuma</option>{editorias.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}</select></Field>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <fieldset className="space-y-1"><legend className="mb-1 text-sm font-medium">Prazo de produção</legend>
                  <div className="grid grid-cols-2 gap-2"><input name="prazoData" type="date" defaultValue={inicial.prazoData} aria-label="Data do prazo" className={inputCls} /><input name="prazoHora" type="time" defaultValue={inicial.prazoHora} aria-label="Hora do prazo" className={inputCls} /></div>
                </fieldset>
                <fieldset className="space-y-1"><legend className="mb-1 text-sm font-medium">Data prevista de publicação</legend>
                  <div className="grid grid-cols-2 gap-2"><input name="publicarData" type="date" defaultValue={inicial.publicarData} aria-label="Data de publicação" className={inputCls} /><input name="publicarHora" type="time" defaultValue={inicial.publicarHora} aria-label="Hora de publicação" className={inputCls} /></div>
                </fieldset>
              </div>
            </section>

            <section aria-labelledby="sec-redes" className="space-y-3 rounded-xl border border-borda bg-cartao p-4">
              <h2 id="sec-redes" className="text-sm font-semibold uppercase tracking-wide text-tinta/70">Redes sociais</h2>
              <div className="flex flex-wrap gap-2" role="group" aria-label="Redes de publicação">
                {REDES_ATIVAS.map((r) => {
                  const compat = FORMATOS_POR_REDE[r].includes(formato);
                  return (
                    <label key={r} className={`flex min-h-10 cursor-pointer items-center gap-2 rounded-lg border px-3 text-sm ${redes.includes(r) ? "border-verde bg-verde/10" : "border-borda bg-white"}`}>
                      <input type="checkbox" name="redes" value={r} checked={redes.includes(r)} onChange={() => alternarRede(r)} className="h-4 w-4" />
                      <RedeTag rede={r} comNome />{r === "instagram" && contasIg.length > 1
                        ? <select name="conta_instagram" defaultValue={inicial.contaPorRede?.instagram ?? contasIg[0].igId} onClick={(e) => e.stopPropagation()} aria-label="Conta do Instagram desta publicação" className="min-h-8 rounded border border-borda bg-white px-1 text-xs">{contasIg.map((c) => <option key={c.igId} value={c.igId}>{c.usuario}</option>)}</select>
                        : contas[r] ? <span className="text-xs text-tinta/70">{contas[r]}</span> : <span className="text-xs text-amber-800">(sem conta conectada)</span>}{!compat && <span className="text-xs text-red-700">(não aceita {FORMATO_ROTULO[formato]})</span>}
                    </label>
                  );
                })}
              </div>
            </section>

            <section aria-labelledby="sec-conteudo" className="space-y-3 rounded-xl border border-borda bg-cartao p-4">
              <h2 id="sec-conteudo" className="text-sm font-semibold uppercase tracking-wide text-tinta/70">Legenda e hashtags</h2>
              <Field label="Legenda (padrão para todas as redes)">
                <textarea name="legenda" rows={6} maxLength={20000} value={legenda} onChange={(e) => setLegenda(e.target.value)} className={inputCls + " py-2"} />
              </Field>
              <p className={`text-right text-xs ${usados > limiteMin ? "font-semibold text-red-700" : "text-tinta/60"}`} aria-live="polite">{usados} / {limiteMin} caracteres (limite mais restrito entre as redes escolhidas)</p>
              <Field label="Hashtags">
                <input name="hashtags" maxLength={600} value={hashtags} onChange={(e) => setHashtags(e.target.value)} placeholder="#NovaBerith #Advento" className={inputCls} />
              </Field>
              <div className="flex flex-wrap items-center gap-2 text-xs text-tinta/70">
                <span>{normalizarHashtags(hashtags).length} hashtag(s)</span>
                {hashtagsPadrao && !hashtags.includes(hashtagsPadrao.split(/\s+/)[0]) && <button type="button" onClick={() => setHashtags((h) => `${h} ${hashtagsPadrao}`.trim())} className="rounded border border-borda px-2 py-1 hover:bg-fundo">Adicionar padrão do ministério</button>}
              </div>
              {redes.length > 0 && (
                <details className="rounded-lg border border-borda p-3">
                  <summary className="min-h-8 cursor-pointer text-sm font-medium">Ajustes por rede (opcional)</summary>
                  <div className="mt-3 space-y-4">
                    {redes.map((r) => {
                      const lim = LIMITES[r];
                      const t = textoDaRede({ legenda, hashtags }, { legenda: porRede[r]?.legenda || null, hashtags: porRede[r]?.hashtags || null });
                      const n = contarCaracteres(t);
                      return (
                        <div key={r} className="space-y-2 border-t border-borda pt-3 first:border-0 first:pt-0">
                          <p className="flex items-center gap-2 text-sm font-medium"><RedeTag rede={r} comNome /><span className={`ml-auto text-xs ${n > lim.legenda ? "font-semibold text-red-700" : "text-tinta/60"}`}>{n} / {lim.legenda}</span></p>
                          {lim.titulo && <Field label={`Título do vídeo (até ${lim.titulo})`}><input name={`titulo_${r}`} maxLength={150} value={porRede[r]?.titulo ?? ""} onChange={(e) => setRede(r, "titulo", e.target.value)} className={inputCls} /></Field>}
                          <Field label="Legenda própria (vazio = usa a padrão)"><textarea name={`legenda_${r}`} rows={3} maxLength={20000} value={porRede[r]?.legenda ?? ""} onChange={(e) => setRede(r, "legenda", e.target.value)} className={inputCls + " py-2"} /></Field>
                          <Field label="Hashtags próprias (vazio = usa as padrão)"><input name={`hashtags_${r}`} maxLength={600} value={porRede[r]?.hashtags ?? ""} onChange={(e) => setRede(r, "hashtags", e.target.value)} className={inputCls} /></Field>
                        </div>
                      );
                    })}
                  </div>
                </details>
              )}
            </section>

            <section aria-labelledby="sec-midias" className="space-y-3 rounded-xl border border-borda bg-cartao p-4">
              <h2 id="sec-midias" className="text-sm font-semibold uppercase tracking-wide text-tinta/70">Mídias</h2>
              {midias.length === 0 ? <p className="text-sm text-tinta/60">Nenhuma mídia escolhida.</p> : (
                <ol className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {midias.map((m, i) => (
                    <li key={m.id} className="space-y-1 rounded-lg border border-borda p-2">
                      <div className="aspect-square overflow-hidden rounded bg-borda/50">
                        {m.tipo === "imagem"
                          // eslint-disable-next-line @next/next/no-img-element
                          ? <img src={`/api/midias/${m.id}`} alt={m.nome} className="h-full w-full object-cover" />
                          : <video src={`/api/midias/${m.id}`} muted preload="metadata" className="h-full w-full object-cover" aria-label={m.nome} />}
                      </div>
                      <p className="truncate text-xs" title={m.nome}>{i + 1}. {m.nome}</p>
                      <div className="flex gap-1">
                        <button type="button" onClick={() => { setMidias((a) => { const b = [...a]; [b[i - 1], b[i]] = [b[i], b[i - 1]]; return b; }); agendarAuto(); }} disabled={i === 0} aria-label={`Mover ${m.nome} para antes`} className="min-h-8 flex-1 rounded border border-borda text-xs disabled:opacity-40">←</button>
                        <button type="button" onClick={() => { setMidias((a) => { const b = [...a]; [b[i + 1], b[i]] = [b[i], b[i + 1]]; return b; }); agendarAuto(); }} disabled={i === midias.length - 1} aria-label={`Mover ${m.nome} para depois`} className="min-h-8 flex-1 rounded border border-borda text-xs disabled:opacity-40">→</button>
                        <button type="button" onClick={() => { setMidias((a) => a.filter((x) => x.id !== m.id)); agendarAuto(); }} aria-label={`Remover ${m.nome}`} className="min-h-8 flex-1 rounded border border-red-300 text-xs text-red-700">Remover</button>
                      </div>
                    </li>
                  ))}
                </ol>
              )}
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => setSeletor(true)} className="min-h-10 rounded-lg border border-borda bg-white px-4 text-sm hover:bg-fundo">Escolher da biblioteca</button>
              </div>
              <UploadMidia atualizar={false} rotulo="Enviar novas mídias" onEnviado={async (id, nome) => {
                const r = await fetch(`/api/midias/lista?q=${encodeURIComponent(nome.replace(/\.[^.]+$/, ""))}`).then((x) => x.json()).catch(() => null) as { itens?: { id: number; tipo: "imagem" | "video"; nome_original: string; largura: number | null; altura: number | null }[] } | null;
                const achado = r?.itens?.find((x) => x.id === id);
                const item: MidiaSel | undefined = achado && { id: achado.id, tipo: achado.tipo, nome: achado.nome_original, largura: achado.largura, altura: achado.altura };
                setMidias((a) => (a.some((x) => x.id === id) ? a : [...a, item ?? { id, tipo: /\.(mp4|mov|webm)$/i.test(nome) ? "video" : "imagem", nome, largura: null, altura: null }]));
                agendarAuto();
              }} />
            </section>

            <section aria-labelledby="sec-notas" className="space-y-3 rounded-xl border border-borda bg-cartao p-4">
              <h2 id="sec-notas" className="text-sm font-semibold uppercase tracking-wide text-tinta/70">Referências e observações</h2>
              <Field label="Referências (links, ideias, inspirações)"><textarea name="referencias" rows={3} maxLength={5000} defaultValue={inicial.referencias} className={inputCls + " py-2"} /></Field>
              <Field label="Observações internas"><textarea name="observacoes" rows={3} maxLength={5000} defaultValue={inicial.observacoes} className={inputCls + " py-2"} /></Field>
            </section>
          </fieldset>

          <div role="status" aria-live="polite" className={`min-h-5 text-xs ${auto.tipo === "erro" ? "text-red-700" : "text-tinta/60"}`}>{auto.msg}</div>
          {!somenteLeitura && inicial.id && <button type="submit" name="acao" value="revisao" className="min-h-11 rounded-lg border border-verde px-4 text-sm font-medium text-verde-escuro hover:bg-verde/10">Salvar e enviar para revisão</button>}
        </div>

        <aside className="space-y-4 lg:sticky lg:top-4 lg:self-start" aria-label="Pré-visualização e pendências">
          <div className="rounded-xl border border-borda bg-cartao p-3">
            <div className="mb-3 flex flex-wrap gap-1" role="tablist" aria-label="Pré-visualização">
              {redes.map((r) => <button key={r} type="button" role="tab" aria-selected={ativa === r} onClick={() => setAtiva(r)} className={`min-h-9 rounded-lg px-3 text-xs ${ativa === r ? "bg-verde text-white" : "border border-borda"}`}>{REDE_ROTULO[r]}</button>)}
              {redes.includes("instagram") && <button type="button" role="tab" aria-selected={ativa === "feed"} onClick={() => setAtiva("feed")} className={`min-h-9 rounded-lg px-3 text-xs ${ativa === "feed" ? "bg-verde text-white" : "border border-borda"}`}>Feed do Instagram</button>}
            </div>
            {redes.length === 0 ? <p className="p-4 text-center text-sm text-tinta/60">Escolha uma rede para ver a pré-visualização.</p>
              : ativa === "feed" && redes.includes("instagram") ? <PreviaFeed d={prevDados("instagram")} recentes={recentes} />
              : <Previa rede={redes.includes(ativa as Rede) ? (ativa as Rede) : redes[0]} d={prevDados(redes.includes(ativa as Rede) ? (ativa as Rede) : redes[0])} />}
          </div>
          <div className="rounded-xl border border-borda bg-cartao p-3 text-sm" aria-live="polite">
            <p className="mb-1 font-medium">Antes de enviar para revisão</p>
            {pendencias.length === 0 ? <p className="text-green-800">✓ Conteúdo completo para enviar.</p> : <ul className="list-disc space-y-1 pl-5 text-red-800">{pendencias.map((p) => <li key={p}>{p}</li>)}</ul>}
          </div>
        </aside>
      </div>
      {seletor && <SeletorMidia selecionadas={midias.map((m) => m.id)} aoFechar={() => setSeletor(false)} aoConfirmar={(novas) => { setMidias((a) => [...a, ...novas.filter((n) => !a.some((x) => x.id === n.id))]); setSeletor(false); agendarAuto(); }} />}
    </ActionForm>
  );
}

function SeletorMidia({ selecionadas, aoFechar, aoConfirmar }: { selecionadas: number[]; aoFechar: () => void; aoConfirmar: (m: MidiaSel[]) => void }) {
  const [q, setQ] = useState("");
  const [itens, setItens] = useState<MidiaSel[] | null>(null);
  const [marcadas, setMarcadas] = useState<Record<number, MidiaSel>>({});
  const [erro, setErro] = useState("");
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { ref.current?.showModal(); }, []);
  useEffect(() => {
    const t = setTimeout(() => {
      fetch(`/api/midias/lista?q=${encodeURIComponent(q)}`).then((r) => r.json()).then((j: { itens?: Array<{ id: number; tipo: "imagem" | "video"; nome_original: string; largura: number | null; altura: number | null }>; erro?: string }) => {
        if (j.erro) setErro(j.erro); else { setErro(""); setItens((j.itens ?? []).map((m) => ({ id: m.id, tipo: m.tipo, nome: m.nome_original, largura: m.largura, altura: m.altura }))); }
      }).catch(() => setErro("Não foi possível carregar a biblioteca."));
    }, 250);
    return () => clearTimeout(t);
  }, [q]);
  return (
    <dialog ref={ref} onClose={aoFechar} aria-labelledby="titulo-seletor" className="m-auto w-[min(92vw,720px)] rounded-xl border border-borda p-0 backdrop:bg-black/40">
      <div className="space-y-3 p-4">
        <div className="flex items-center justify-between"><h2 id="titulo-seletor" className="font-medium">Biblioteca de mídia</h2><button type="button" onClick={() => ref.current?.close()} aria-label="Fechar" className="min-h-10 min-w-10 rounded-lg hover:bg-fundo">✕</button></div>
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") e.preventDefault(); }} placeholder="Buscar pelo nome" aria-label="Buscar mídia" className={inputCls} />
        {erro && <p role="alert" className="text-sm text-red-800">{erro}</p>}
        {itens === null ? <p className="text-sm text-tinta/60">Carregando…</p> : itens.length === 0 ? <p className="text-sm text-tinta/60">Nada encontrado.</p> : (
          <ul className="grid max-h-[50vh] grid-cols-3 gap-2 overflow-y-auto sm:grid-cols-4">
            {itens.map((m) => {
              const ja = selecionadas.includes(m.id), on = ja || Boolean(marcadas[m.id]);
              return (
                <li key={m.id}>
                  <button type="button" disabled={ja} aria-pressed={on} onClick={() => setMarcadas((a) => { const b = { ...a }; if (b[m.id]) delete b[m.id]; else b[m.id] = m; return b; })}
                    className={`relative block w-full overflow-hidden rounded-lg border-2 text-left ${on ? "border-verde" : "border-transparent"} disabled:opacity-50`}>
                    <div className="aspect-square bg-borda/50">
                      {m.tipo === "imagem"
                        // eslint-disable-next-line @next/next/no-img-element
                        ? <img src={`/api/midias/${m.id}`} alt="" className="h-full w-full object-cover" loading="lazy" />
                        : <span className="flex h-full items-center justify-center text-2xl" aria-hidden>▶</span>}
                    </div>
                    <span className="block truncate px-1 text-[11px]">{m.nome}</span>{ja && <span className="absolute right-1 top-1 rounded bg-verde px-1 text-[10px] text-white">já usada</span>}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        <div className="flex justify-end gap-2"><button type="button" onClick={() => ref.current?.close()} className="min-h-10 rounded-lg border border-borda px-4 text-sm">Cancelar</button>
          <button type="button" disabled={Object.keys(marcadas).length === 0} onClick={() => aoConfirmar(Object.values(marcadas))} className="min-h-10 rounded-lg bg-verde px-4 text-sm text-white disabled:opacity-50">Adicionar {Object.keys(marcadas).length || ""}</button></div>
      </div>
    </dialog>
  );
}
