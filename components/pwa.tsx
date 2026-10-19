"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";

type EventoInstalar = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

const semAssinatura = () => () => {};
const CHAVE_OCULTO = "nb_instalar_oculto";

function lerOculto() { try { return localStorage.getItem(CHAVE_OCULTO) === "1"; } catch { return false; } }
function assinarOculto(cb: () => void) { window.addEventListener("storage", cb); window.addEventListener("nb-oculto", cb); return () => { window.removeEventListener("storage", cb); window.removeEventListener("nb-oculto", cb); }; }
function assinarRede(cb: () => void) { window.addEventListener("online", cb); window.addEventListener("offline", cb); return () => { window.removeEventListener("online", cb); window.removeEventListener("offline", cb); }; }

/** Registro do service worker, botão "Instalar app", aviso de atualização e estado de rede. */
export function Pwa() {
  const [instalar, setInstalar] = useState<EventoInstalar | null>(null);
  const [espera, setEspera] = useState<ServiceWorker | null>(null);
  const [instaladoAgora, setInstaladoAgora] = useState(false);
  const usuarioAceitouAtualizar = useRef(false);
  // Leituras do navegador sem setState em efeito (no servidor valem os valores seguros do 3º argumento).
  const offline = useSyncExternalStore(assinarRede, () => !navigator.onLine, () => false);
  const oculto = useSyncExternalStore(assinarOculto, lerOculto, () => true);
  const standalone = useSyncExternalStore(semAssinatura, () => window.matchMedia("(display-mode: standalone)").matches || (navigator as unknown as { standalone?: boolean }).standalone === true, () => true);
  const ios = useSyncExternalStore(semAssinatura, () => /iphone|ipad|ipod/i.test(navigator.userAgent), () => false);
  const instalado = standalone || instaladoAgora;

  useEffect(() => {
    const antes = (e: Event) => { e.preventDefault(); setInstalar(e as EventoInstalar); };
    const feito = () => setInstaladoAgora(true);
    window.addEventListener("beforeinstallprompt", antes); window.addEventListener("appinstalled", feito);
    // Recarrega SOMENTE depois que a pessoa aceita a atualização (nunca na primeira instalação, para não perder o que estiver digitando).
    let recarregou = false;
    const trocou = () => { if (usuarioAceitouAtualizar.current && !recarregou) { recarregou = true; location.reload(); } };
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      navigator.serviceWorker.register("/sw.js").then((reg) => {
        if (reg.waiting) setEspera(reg.waiting);
        reg.addEventListener("updatefound", () => {
          const nw = reg.installing;
          nw?.addEventListener("statechange", () => { if (nw.state === "installed" && navigator.serviceWorker.controller) setEspera(nw); });
        });
      }).catch(() => {});
      navigator.serviceWorker.addEventListener("controllerchange", trocou);
    }
    return () => { window.removeEventListener("beforeinstallprompt", antes); window.removeEventListener("appinstalled", feito); if ("serviceWorker" in navigator) navigator.serviceWorker.removeEventListener("controllerchange", trocou); };
  }, []);

  const ocultar = () => { try { localStorage.setItem(CHAVE_OCULTO, "1"); } catch { /* sem armazenamento */ } window.dispatchEvent(new Event("nb-oculto")); };
  const mostrarInstalar = !instalado && !oculto && (instalar !== null || ios);
  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-50 mx-auto flex max-w-3xl flex-col gap-1 p-2 pt-[calc(env(safe-area-inset-top)+0.5rem)]" aria-live="polite">
      {offline && <p role="status" className="pointer-events-auto rounded-lg bg-amber-100 px-3 py-2 text-sm text-amber-900">Você está sem conexão. Nada será salvo até a internet voltar.</p>}
      {espera && (
        <div role="status" className="pointer-events-auto flex items-center justify-between gap-2 rounded-lg bg-verde px-3 py-2 text-sm text-white">
          <span>Nova versão disponível.</span>
          <button className="min-h-11 rounded-md bg-white px-3 text-verde" onClick={() => { usuarioAceitouAtualizar.current = true; espera.postMessage({ tipo: "SKIP_WAITING" }); }}>Atualizar</button>
        </div>
      )}
      {mostrarInstalar && (
        <div className="pointer-events-auto flex items-center justify-between gap-2 rounded-lg bg-white px-3 py-2 text-sm shadow ring-1 ring-borda">
          {instalar ? <span>Instale o Berith: abre em tela cheia, como um aplicativo.</span> : <span>Para instalar: toque em Compartilhar e em “Adicionar à Tela de Início”.</span>}
          <span className="flex gap-1">
            {instalar && <button className="min-h-11 rounded-md bg-verde px-3 text-white" onClick={async () => { await instalar.prompt(); setInstalar(null); }}>Instalar app</button>}
            <button className="min-h-11 rounded-md px-2 text-verde" onClick={ocultar}>Agora não</button>
          </span>
        </div>
      )}
    </div>
  );
}
