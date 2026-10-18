"use client";

import { useState } from "react";
import { REDE_ROTULO, type Formato, type Rede } from "@/lib/editorial";

export type MidiaPrev = { id: number; tipo: "imagem" | "video"; nome: string };
type Dados = { conta: string; texto: string; titulo: string; formato: Formato; midias: MidiaPrev[] };

const src = (m: MidiaPrev) => `/api/midias/${m.id}`;

function Midia({ m, className = "" }: { m: MidiaPrev | undefined; className?: string }) {
  if (!m) return <div className={`flex items-center justify-center bg-borda/60 text-xs text-tinta/50 ${className}`}>Sem mídia</div>;
  // eslint-disable-next-line @next/next/no-img-element
  return m.tipo === "imagem" ? <img src={src(m)} alt={m.nome} className={`object-cover ${className}`} /> : <video src={src(m)} muted playsInline preload="metadata" className={`object-cover ${className}`} aria-label={m.nome} />;
}

function Legenda({ nome, texto, limite }: { nome: string; texto: string; limite: number }) {
  const [aberto, setAberto] = useState(false);
  const cortado = !aberto && Array.from(texto).length > limite;
  return (
    <p className="whitespace-pre-line break-words text-[13px] leading-snug">
      <strong>{nome}</strong> {cortado ? Array.from(texto).slice(0, limite).join("") + "… " : texto}
      {cortado && <button type="button" onClick={() => setAberto(true)} className="text-tinta/60">mais</button>}
    </p>
  );
}

const Moldura = ({ rede, children }: { rede: string; children: React.ReactNode }) => (
  <figure className="mx-auto w-full max-w-[340px] overflow-hidden rounded-xl border border-borda bg-white text-tinta shadow-sm" aria-label={`Pré-visualização no ${rede}`}>{children}</figure>
);

export function PreviaInstagram({ d }: { d: Dados }) {
  const vertical = d.formato === "stories" || d.formato === "reels";
  return (
    <Moldura rede="Instagram">
      <div className="flex items-center gap-2 p-2"><span aria-hidden className="h-8 w-8 rounded-full bg-verde" /><span className="text-sm font-semibold">{d.conta}</span><span className="ml-auto text-xs text-tinta/50">{d.formato === "stories" ? "Stories" : d.formato === "reels" ? "Reels" : ""}</span></div>
      <Midia m={d.midias[0]} className={`w-full ${vertical ? "aspect-[9/16]" : "aspect-[4/5]"}`} />
      {d.midias.length > 1 && <p className="px-2 pt-1 text-center text-[11px] text-tinta/60" aria-label={`${d.midias.length} mídias no carrossel`}>{"● ".repeat(d.midias.length).trim()}</p>}
      <div className="space-y-1 p-2">
        <p aria-hidden className="text-lg">♡ 💬 ➤</p>
        {d.formato !== "stories" && <Legenda nome={d.conta} texto={d.texto} limite={125} />}
      </div>
    </Moldura>
  );
}

/** Grade do perfil: mostra onde a nova publicação ficará entre as últimas já publicadas. */
export function PreviaFeed({ d, recentes }: { d: Dados; recentes: MidiaPrev[] }) {
  const celulas = [d.midias[0], ...recentes].slice(0, 9);
  return (
    <Moldura rede="feed do Instagram">
      <div className="flex items-center gap-2 p-2"><span aria-hidden className="h-9 w-9 rounded-full bg-verde" /><div><p className="text-sm font-semibold">{d.conta}</p><p className="text-[11px] text-tinta/60">Grade do perfil</p></div></div>
      <div className="grid grid-cols-3 gap-px bg-borda">
        {Array.from({ length: 9 }, (_, i) => (
          <div key={i} className={`relative aspect-[4/5] bg-white ${i === 0 ? "ring-2 ring-inset ring-cobre" : ""}`}>
            {celulas[i] ? <Midia m={celulas[i]} className="h-full w-full" /> : <div className="h-full w-full bg-borda/40" />}
            {i === 0 && <span className="absolute left-1 top-1 rounded bg-cobre px-1 text-[10px] text-white">nova</span>}
          </div>
        ))}
      </div>
    </Moldura>
  );
}

export function PreviaFacebook({ d }: { d: Dados }) {
  return (
    <Moldura rede="Facebook">
      <div className="flex items-center gap-2 p-3"><span aria-hidden className="h-9 w-9 rounded-full bg-verde" /><div><p className="text-sm font-semibold">{d.conta}</p><p className="text-[11px] text-tinta/60">Agora · Público</p></div></div>
      {d.texto && <p className="whitespace-pre-line break-words px-3 pb-2 text-[13px]">{d.texto}</p>}
      {d.midias[0] && <Midia m={d.midias[0]} className="max-h-[420px] w-full" />}
      <p aria-hidden className="border-t border-borda p-2 text-xs text-tinta/60">👍 Curtir · 💬 Comentar · ↗ Compartilhar</p>
    </Moldura>
  );
}

export function PreviaTikTok({ d }: { d: Dados }) {
  return (
    <Moldura rede="TikTok">
      <div className="relative aspect-[9/16] bg-black text-white">
        <Midia m={d.midias.find((m) => m.tipo === "video") ?? d.midias[0]} className="absolute inset-0 h-full w-full" />
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-3">
          <p className="text-sm font-semibold">@{d.conta.replace(/^@/, "")}</p>
          <p className="line-clamp-3 whitespace-pre-line break-words text-[13px]">{d.texto}</p>
        </div>
      </div>
    </Moldura>
  );
}

export function PreviaYouTube({ d }: { d: Dados }) {
  return (
    <Moldura rede="YouTube">
      <div className="aspect-video bg-black"><Midia m={d.midias.find((m) => m.tipo === "video") ?? d.midias[0]} className="h-full w-full" /></div>
      <div className="space-y-1 p-3">
        <p className="line-clamp-2 text-sm font-semibold">{d.titulo || "Título do vídeo"}</p>
        <p className="text-[11px] text-tinta/60">{d.conta} · agora{d.formato === "short" ? " · Shorts" : ""}</p>
        <p className="line-clamp-3 whitespace-pre-line break-words text-[12px] text-tinta/80">{d.texto}</p>
      </div>
    </Moldura>
  );
}

export function Previa({ rede, d }: { rede: Rede; d: Dados }) {
  if (rede === "instagram") return <PreviaInstagram d={d} />;
  if (rede === "facebook") return <PreviaFacebook d={d} />;
  if (rede === "tiktok") return <PreviaTikTok d={d} />;
  return <PreviaYouTube d={d} />;
}
export const ROTULO_REDE = REDE_ROTULO;
export type { Dados as DadosPrevia };
