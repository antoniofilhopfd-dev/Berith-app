/* Service worker da Nova Berith.
 * - Push: exibe notificações e abre a página correta ao tocar.
 * - Cache: SOMENTE ícones/logo e a página offline. Nunca páginas privadas, /api, financeiro ou dados pessoais.
 * - Atualização controlada: a nova versão espera até o usuário aceitar (mensagem SKIP_WAITING). */
const VERSAO = "nb-v2";
const ESTATICOS = ["/offline.html", "/icons/icon-192.png", "/icons/icon-512.png", "/brand/logo-cor.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSAO).then((c) => c.addAll(ESTATICOS)));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSAO).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener("message", (e) => { if (e.data && e.data.tipo === "SKIP_WAITING") self.skipWaiting(); });

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/icons/") || url.pathname.startsWith("/brand/")) {
    e.respondWith(caches.match(req).then((r) => r || fetch(req)));
    return;
  }
  // Páginas: sempre da rede (conteúdo privado nunca é guardado). Offline: página de aviso, sem fingir que algo foi salvo.
  if (req.mode === "navigate") e.respondWith(fetch(req).catch(() => caches.match("/offline.html")));
});

self.addEventListener("push", (e) => {
  let d = { titulo: "Nova Berith", corpo: "", url: "/notificacoes" };
  try { d = { ...d, ...e.data.json() }; } catch (_) {}
  e.waitUntil(self.registration.showNotification(d.titulo, {
    body: d.corpo || undefined, icon: "/icons/icon-192.png", badge: "/icons/icon-192.png", tag: d.id ? "nb-" + d.id : undefined, data: { url: d.url },
  }));
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  let alvo = (e.notification.data && e.notification.data.url) || "/notificacoes";
  if (typeof alvo !== "string" || !alvo.startsWith("/") || alvo.startsWith("//")) alvo = "/notificacoes";
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((cs) => {
    for (const c of cs) if (new URL(c.url).origin === self.location.origin && "focus" in c) { c.navigate(alvo); return c.focus(); }
    return self.clients.openWindow(alvo);
  }));
});
