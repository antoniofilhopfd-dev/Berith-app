"use client";

import { useEffect, useState } from "react";

type Estado = "carregando" | "nao-suportado" | "bloqueado" | "desativado" | "ativo" | "sem-servidor";
const b64 = (s: string) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(s.length / 4) * 4, "=")), (c) => c.charCodeAt(0));

export function PushToggle() {
  const [estado, setEstado] = useState<Estado>("carregando");
  const [msg, setMsg] = useState("");
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    (async () => {
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return setEstado("nao-suportado");
      if (Notification.permission === "denied") return setEstado("bloqueado");
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      setEstado(sub ? "ativo" : "desativado");
    })().catch(() => setEstado("nao-suportado"));
  }, []);

  async function ativar() {
    setOcupado(true); setMsg("");
    try {
      const k = await (await fetch("/api/push/chave")).json();
      if (!k.chave) { setEstado("sem-servidor"); return; }
      const perm = await Notification.requestPermission();
      if (perm !== "granted") { setEstado(perm === "denied" ? "bloqueado" : "desativado"); return; }
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64(k.chave) });
      const r = await fetch("/api/push/inscrever", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(sub.toJSON()) });
      if (!r.ok) { await sub.unsubscribe(); throw new Error((await r.json()).erro ?? "Falha ao registrar."); }
      setEstado("ativo"); setMsg("Notificações ativadas neste dispositivo.");
    } catch (e) { setMsg(e instanceof Error ? e.message : "Não foi possível ativar."); } finally { setOcupado(false); }
  }
  async function desativar() {
    setOcupado(true); setMsg("");
    try {
      const reg = await navigator.serviceWorker.getRegistration(); const sub = await reg?.pushManager.getSubscription();
      if (sub) { await fetch("/api/push/inscrever", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ endpoint: sub.endpoint }) }); await sub.unsubscribe(); }
      setEstado("desativado"); setMsg("Notificações desativadas neste dispositivo.");
    } catch { setMsg("Não foi possível desativar."); } finally { setOcupado(false); }
  }

  const texto: Record<Estado, string> = {
    carregando: "Verificando este dispositivo…", ativo: "Este dispositivo recebe notificações.", desativado: "Este dispositivo não recebe notificações.",
    bloqueado: "As notificações estão bloqueadas nas configurações do navegador.", "sem-servidor": "O envio de notificações ainda não foi configurado no servidor.",
    "nao-suportado": "Este navegador não oferece notificações push. No iPhone, instale o app na Tela de Início (iOS 16.4 ou superior) e abra-o por lá.",
  };
  return (
    <div className="space-y-2">
      <p className="text-sm" role="status">{texto[estado]}</p>
      {estado === "desativado" && <button onClick={ativar} disabled={ocupado} className="min-h-11 rounded-lg bg-verde px-4 text-sm text-white disabled:opacity-60">Ativar neste dispositivo</button>}
      {estado === "ativo" && <button onClick={desativar} disabled={ocupado} className="min-h-11 rounded-lg border border-red-700 px-4 text-sm text-red-700 disabled:opacity-60">Desativar neste dispositivo</button>}
      {msg && <p className="text-xs text-tinta/70">{msg}</p>}
    </div>
  );
}
