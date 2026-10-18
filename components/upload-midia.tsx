"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useHidratado } from "./hidratado";

type Resultado = { nome: string; ok: boolean; msg: string };

/** Envio direto do arquivo (corpo bruto) com barra de progresso, fila sequencial e aviso de duplicados. */
export function UploadMidia({ pastaId = null, onEnviado, rotulo = "Enviar imagens e vídeos", atualizar = true }: {
  pastaId?: number | null; onEnviado?: (id: number, nome: string, duplicada: boolean) => void; rotulo?: string; atualizar?: boolean;
}) {
  const router = useRouter();
  const pronto = useHidratado();
  const ref = useRef<HTMLInputElement>(null);
  const [enviando, setEnviando] = useState(false);
  const [progresso, setProgresso] = useState(0);
  const [atual, setAtual] = useState("");
  const [resultados, setResultados] = useState<Resultado[]>([]);

  function enviarUm(arquivo: File): Promise<Resultado & { id?: number; duplicada?: boolean }> {
    return new Promise((resolve) => {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", "/api/midias");
      xhr.setRequestHeader("X-Nome", encodeURIComponent(arquivo.name));
      if (pastaId) xhr.setRequestHeader("X-Pasta", String(pastaId));
      xhr.setRequestHeader("Content-Type", arquivo.type || "application/octet-stream");
      xhr.upload.onprogress = (e) => { if (e.lengthComputable) setProgresso(Math.round((e.loaded / e.total) * 100)); };
      xhr.onload = () => {
        let j: { ok?: boolean; erro?: string; id?: number; duplicada?: boolean } = {};
        try { j = JSON.parse(xhr.responseText); } catch { /* resposta não JSON */ }
        if (xhr.status === 201 || xhr.status === 200) resolve({ nome: arquivo.name, ok: true, id: j.id, duplicada: j.duplicada, msg: j.duplicada ? "Já existe na biblioteca (reutilizado)." : "Enviado." });
        else resolve({ nome: arquivo.name, ok: false, msg: j.erro ?? "Falha no envio." });
      };
      xhr.onerror = () => resolve({ nome: arquivo.name, ok: false, msg: "Sem conexão. O envio não foi concluído — tente novamente." });
      xhr.ontimeout = () => resolve({ nome: arquivo.name, ok: false, msg: "Tempo esgotado. Tente novamente." });
      xhr.timeout = 30 * 60_000;
      xhr.send(arquivo);
    });
  }

  async function aoEscolher(e: React.ChangeEvent<HTMLInputElement>) {
    const arquivos = Array.from(e.currentTarget.files ?? []);
    e.currentTarget.value = "";
    if (arquivos.length === 0 || enviando) return;
    setEnviando(true); setResultados([]);
    const out: Resultado[] = [];
    for (const a of arquivos) {
      setAtual(a.name); setProgresso(0);
      const r = await enviarUm(a);
      out.push(r); setResultados([...out]);
      if (r.ok && r.id) onEnviado?.(r.id, a.name, Boolean(r.duplicada));
    }
    setEnviando(false); setAtual(""); setProgresso(0);
    if (atualizar && out.some((r) => r.ok)) router.refresh();
  }

  return (
    <div className="space-y-2">
      <label className={`flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border border-dashed border-verde/60 bg-white p-2 text-sm ${enviando || !pronto ? "opacity-60" : ""}`}>
        <span className="inline-flex min-h-9 items-center rounded-md bg-verde px-3 text-white">Escolher arquivos</span>
        <span className="text-tinta/70">{rotulo} (JPG, PNG, WebP, MP4, MOV, WebM)</span>
        <input ref={ref} type="file" multiple accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime,video/webm" disabled={enviando || !pronto} onChange={aoEscolher} className="sr-only" aria-label={rotulo} />
      </label>
      {enviando && (
        <div role="progressbar" aria-valuenow={progresso} aria-valuemin={0} aria-valuemax={100} aria-label={`Enviando ${atual}`}>
          <p className="mb-1 truncate text-xs text-tinta/70">{atual} — {progresso}%</p>
          <div className="h-2 overflow-hidden rounded-full bg-borda"><div className="h-full bg-verde transition-all" style={{ width: `${progresso}%` }} /></div>
        </div>
      )}
      {resultados.map((r, i) => <p key={i} role={r.ok ? "status" : "alert"} className={`rounded-lg px-3 py-2 text-xs ${r.ok ? "bg-green-50 text-green-800" : "bg-red-50 text-red-800"}`}>{r.nome}: {r.msg}</p>)}
    </div>
  );
}
