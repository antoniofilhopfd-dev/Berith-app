import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import vm from "node:vm";

type Ouvinte = (e: any) => void;
function carregar() {
  const ouvintes: Record<string, Ouvinte> = {};
  const cache = new Map<string, string>();
  const notificacoes: any[] = []; const aberturas: string[] = []; let skip = false; const clientes: any[] = [];
  const caches = {
    open: async () => ({ addAll: async (urls: string[]) => urls.forEach((u) => cache.set(u, "estático:" + u)) }),
    keys: async () => ["nb-v0", "nb-v1"], delete: async () => true,
    match: async (r: any) => { const u = typeof r === "string" ? r : new URL(r.url).pathname; return cache.has(u) ? new Response(cache.get(u)) : undefined; },
  };
  const self: any = {
    location: { origin: "https://app.exemplo.org" }, addEventListener: (n: string, f: Ouvinte) => { ouvintes[n] = f; }, skipWaiting: () => { skip = true; },
    clients: { claim: async () => {}, matchAll: async () => clientes, openWindow: async (u: string) => { aberturas.push(u); } },
    registration: { showNotification: async (t: string, o: any) => { notificacoes.push({ t, o }); } },
  };
  const rede = { falhar: false, chamadas: [] as string[] };
  const ctx = vm.createContext({ self, caches, URL, Response, fetch: async (r: any) => { rede.chamadas.push(new URL(r.url).pathname); if (rede.falhar) throw new Error("offline"); return new Response("da rede"); } });
  vm.runInContext(readFileSync("public/sw.js", "utf8"), ctx);
  return { ouvintes, cache, notificacoes, aberturas, clientes, rede, get skip() { return skip; } };
}
const fetchEvent = (url: string, o: { method?: string; mode?: string } = {}) => {
  let resp: Promise<Response> | undefined;
  return { request: { url: "https://app.exemplo.org" + url, method: o.method ?? "GET", mode: o.mode ?? "same-origin" }, respondWith: (p: Promise<Response>) => { resp = p; }, get resposta() { return resp; } };
};
const esperar = (p: Promise<unknown>) => ({ waitUntil: (x: Promise<unknown>) => { void p; void x; } });

describe("service worker", () => {
  it("instala só arquivos estáticos (ícones, logo e página offline)", async () => {
    const sw = carregar(); let w: Promise<unknown> | undefined;
    sw.ouvintes.install({ waitUntil: (p: Promise<unknown>) => { w = p; } }); await w;
    expect([...sw.cache.keys()].sort()).toEqual(["/brand/logo-cor.png", "/icons/icon-192.png", "/icons/icon-512.png", "/offline.html"]);
    expect([...sw.cache.keys()].some((k) => /financeiro|api|membros|tarefas|comunicados/.test(k))).toBe(false);
  });
  it("navegação sem rede mostra a página offline; com rede usa sempre a rede (nada privado em cache)", async () => {
    const sw = carregar(); await carregar().ouvintes.install({ waitUntil: () => {} }); let w: Promise<unknown> | undefined;
    sw.ouvintes.install({ waitUntil: (p: Promise<unknown>) => { w = p; } }); await w;
    sw.rede.falhar = true;
    const off = fetchEvent("/financeiro", { mode: "navigate" }); sw.ouvintes.fetch(off);
    expect(await (await off.resposta)!.text()).toBe("estático:/offline.html");
    sw.rede.falhar = false;
    const on = fetchEvent("/financeiro", { mode: "navigate" }); sw.ouvintes.fetch(on);
    expect(await (await on.resposta)!.text()).toBe("da rede");
    expect(sw.cache.has("/financeiro")).toBe(false);
  });
  it("não intercepta POST, outras origens nem chamadas de API/arquivos", () => {
    const sw = carregar();
    for (const ev of [fetchEvent("/api/arquivos/1"), fetchEvent("/financeiro", { method: "POST", mode: "navigate" }), fetchEvent("/api/financeiro/exportar?periodo=2026-01")]) {
      sw.ouvintes.fetch(ev); expect(ev.resposta, ev.request.url).toBeUndefined();
    }
    const externo = { request: { url: "https://outro.org/x", method: "GET", mode: "navigate" }, respondWith: () => { throw new Error("não deveria interceptar"); } };
    expect(() => sw.ouvintes.fetch(externo)).not.toThrow();
  });
  it("ícones e logo vêm do cache; atualização só ocorre após o usuário aceitar", async () => {
    const sw = carregar(); let w: Promise<unknown> | undefined; sw.ouvintes.install({ waitUntil: (p: Promise<unknown>) => { w = p; } }); await w;
    const ev = fetchEvent("/icons/icon-192.png"); sw.ouvintes.fetch(ev); expect(await (await ev.resposta)!.text()).toBe("estático:/icons/icon-192.png");
    expect(sw.skip).toBe(false); sw.ouvintes.message({ data: { tipo: "QUALQUER" } }); expect(sw.skip).toBe(false);
    sw.ouvintes.message({ data: { tipo: "SKIP_WAITING" } }); expect(sw.skip).toBe(true);
  });
  it("push mostra a notificação com título, texto e destino", async () => {
    const sw = carregar(); let w: Promise<unknown> | undefined;
    sw.ouvintes.push({ data: { json: () => ({ id: 7, titulo: "Novo comunicado", corpo: "Vigília", url: "/comunicados/3" }) }, waitUntil: (p: Promise<unknown>) => { w = p; } }); await w;
    expect(sw.notificacoes[0].t).toBe("Novo comunicado"); expect(sw.notificacoes[0].o).toMatchObject({ body: "Vigília", data: { url: "/comunicados/3" }, tag: "nb-7" });
  });
  it("push com carga inválida ainda mostra aviso genérico", async () => {
    const sw = carregar(); let w: Promise<unknown> | undefined;
    sw.ouvintes.push({ data: { json: () => { throw new Error("x"); } }, waitUntil: (p: Promise<unknown>) => { w = p; } }); await w;
    expect(sw.notificacoes[0].t).toBe("Nova Berith");
  });
  it("clique abre só destinos internos (bloqueia URLs externas)", async () => {
    for (const [url, esperado] of [["/eventos/3", "/eventos/3"], ["https://evil.example", "/notificacoes"], ["//evil.example", "/notificacoes"], [undefined, "/notificacoes"]] as const) {
      const sw = carregar(); let w: Promise<unknown> | undefined;
      sw.ouvintes.notificationclick({ notification: { close: () => {}, data: { url } }, waitUntil: (p: Promise<unknown>) => { w = p; } }); await w;
      expect(sw.aberturas, String(url)).toEqual([esperado]);
    }
  });
  it("não existe cache.put/add dinâmico no código", () => {
    const codigo = readFileSync("public/sw.js", "utf8");
    expect(codigo).not.toMatch(/cache\.put|\.put\(|cache\.add\(/); void esperar;
  });
});
