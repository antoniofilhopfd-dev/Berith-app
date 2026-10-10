"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { inputCls } from "./action-form";
import { useHidratado } from "./hidratado";

type Resultado = { nome: string; ok: boolean; msg: string };

/** Envio com barra de progresso (XHR), fila sequencial e bloqueio de duplo clique. */
export function UploadBox({ ctxTipo, ctxId, aceitar = "image/jpeg,image/png,image/webp,application/pdf,audio/mpeg,audio/mp4,audio/ogg,audio/wav", exigeAutorizacaoImagem = false, comDescricao = false, rotulo = "Enviar arquivos" }: {
  ctxTipo: string; ctxId: number; aceitar?: string; exigeAutorizacaoImagem?: boolean; comDescricao?: boolean; rotulo?: string;
}) {
  const router = useRouter();
  const pronto = useHidratado();
  const ref = useRef<HTMLFormElement>(null);
  const [enviando, setEnviando] = useState(false);
  const [progresso, setProgresso] = useState(0);
  const [atual, setAtual] = useState("");
  const [resultados, setResultados] = useState<Resultado[]>([]);
  const [selecionados, setSelecionados] = useState(0);

  function enviarUm(arquivo: File, form: HTMLFormElement): Promise<Resultado> {
    return new Promise((resolve) => {
      const fd = new FormData();
      fd.set("ctxTipo", ctxTipo); fd.set("ctxId", String(ctxId)); fd.set("arquivo", arquivo);
      const desc = (form.elements.namedItem("descricao") as HTMLInputElement | null)?.value;
      if (desc) fd.set("descricao", desc);
      if ((form.elements.namedItem("autorizacaoImagem") as HTMLInputElement | null)?.checked) fd.set("autorizacaoImagem", "on");
      const xhr = new XMLHttpRequest();
      xhr.open("POST", "/api/arquivos");
      xhr.upload.onprogress = (e) => { if (e.lengthComputable) setProgresso(Math.round((e.loaded / e.total) * 100)); };
      xhr.onload = () => {
        let msg = "Enviado.";
        try { const j = JSON.parse(xhr.responseText); if (j.erro) msg = j.erro; } catch { if (xhr.status >= 400) msg = "Falha no envio."; }
        resolve({ nome: arquivo.name, ok: xhr.status === 201, msg });
      };
      xhr.onerror = () => resolve({ nome: arquivo.name, ok: false, msg: "Sem conexão. O envio não foi concluído — tente novamente." });
      xhr.ontimeout = () => resolve({ nome: arquivo.name, ok: false, msg: "Tempo esgotado. Tente novamente." });
      xhr.timeout = 5 * 60_000;
      xhr.send(fd);
    });
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (enviando) return;
    const form = e.currentTarget;
    const arquivos = Array.from((form.elements.namedItem("arquivos") as HTMLInputElement).files ?? []);
    if (arquivos.length === 0) return;
    setEnviando(true); setResultados([]);
    const out: Resultado[] = [];
    for (const a of arquivos) {
      setAtual(a.name); setProgresso(0);
      out.push(await enviarUm(a, form));
      setResultados([...out]);
    }
    setEnviando(false); setAtual(""); setProgresso(0);
    if (out.some((r) => r.ok)) { ref.current?.reset(); setSelecionados(0); router.refresh(); }
  }

  return (
    <form ref={ref} onSubmit={onSubmit} className="space-y-3">
      <div>
        <span className="mb-1 block text-sm font-medium">{rotulo}</span>
        {/* Seletor próprio: o texto do input nativo depende do idioma do navegador. */}
        <label className={`flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border border-borda bg-white p-2 text-sm ${enviando ? "opacity-60" : ""}`}>
          <span className="inline-flex min-h-9 items-center rounded-md bg-verde px-3 text-white">Escolher arquivos</span>
          <span className="text-tinta/70">{selecionados === 0 ? "Nenhum arquivo selecionado" : `${selecionados} arquivo(s) selecionado(s)`}</span>
          <input name="arquivos" type="file" multiple accept={aceitar} required disabled={enviando} className="sr-only"
            onChange={(e) => setSelecionados(e.currentTarget.files?.length ?? 0)} />
        </label>
      </div>
      {comDescricao && <input name="descricao" maxLength={300} placeholder="Descrição (opcional)" aria-label="Descrição" className={inputCls} />}
      {exigeAutorizacaoImagem && (
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" name="autorizacaoImagem" required className="mt-1 h-5 w-5 shrink-0" />
          <span>Confirmo que há autorização de uso de imagem das pessoas fotografadas e, no caso de crianças e adolescentes, dos responsáveis.</span>
        </label>
      )}
      <button type="submit" disabled={enviando || !pronto} className="min-h-11 rounded-lg bg-verde px-4 text-sm font-medium text-white disabled:opacity-60">{enviando ? "Enviando…" : "Enviar"}</button>
      {enviando && (
        <div role="progressbar" aria-valuenow={progresso} aria-valuemin={0} aria-valuemax={100} aria-label={`Enviando ${atual}`}>
          <p className="mb-1 truncate text-xs text-tinta/70">{atual} — {progresso}%</p>
          <div className="h-2 overflow-hidden rounded-full bg-borda"><div className="h-full bg-verde transition-all" style={{ width: `${progresso}%` }} /></div>
        </div>
      )}
      {resultados.map((r, i) => <p key={i} role={r.ok ? "status" : "alert"} className={`rounded-lg px-3 py-2 text-xs ${r.ok ? "bg-green-50 text-green-800" : "bg-red-50 text-red-800"}`}>{r.nome}: {r.msg}</p>)}
    </form>
  );
}
