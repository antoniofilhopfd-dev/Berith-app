import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";
import { createHash } from "node:crypto";

let tokenAtual: string | null = null;
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (n: string) => (tokenAtual && n.includes("nb_session") ? { value: tokenAtual } : undefined), set: () => {}, delete: () => {} }),
  headers: async () => new Headers({ host: "localhost" }),
}));

import { NextRequest } from "next/server";
import { closePool, execute, query } from "@/lib/db";
import { POST as enviar, GET as enviarGet, PUT as enviarPut, DELETE as enviarDelete } from "@/app/api/push/enviar/route";
import { POST as inscrever, DELETE as desinscrever } from "@/app/api/push/inscrever/route";
import { GET as chave } from "@/app/api/push/chave/route";
import { definirEnviador } from "@/lib/services/push";
import { notificar } from "@/lib/services/notificacoes";
import { resetTestDb, criarUsuario } from "./helpers";

const SEGREDO = "segredo-do-agendador-com-mais-de-24-caracteres";
let ana = 0, bia = 0;
const tokens = new Map<number, string>();
const req = (url: string, init: { method?: string; body?: string; headers?: Record<string, string> } = {}) => new NextRequest(`http://localhost${url}`, { method: init.method, body: init.body, headers: { host: "localhost", ...(init.headers ?? {}) } });
const post = (auth?: string) => req("/api/push/enviar", { method: "POST", headers: auth ? { authorization: auth } : {} });
const sub = { endpoint: "https://push.exemplo.org/send/abc", keys: { p256dh: "BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U", auth: "tBHItJI5svbpez7KI4CCXg" } };
const json = (body: unknown, headers: Record<string, string> = {}) => ({ body: JSON.stringify(body), headers: { "content-type": "application/json", ...headers } });
const guardado = { ...process.env };

beforeAll(async () => {
  await resetTestDb(); ana = await criarUsuario("ana@t.com"); bia = await criarUsuario("bia@t.com");
  for (const u of [ana, bia]) { const t = `tok-${u}-${Math.random().toString(36).slice(2)}`; tokens.set(u, t); await execute("INSERT INTO sessions (user_id, token_hash, expira_em) VALUES (?, ?, DATE_ADD(UTC_TIMESTAMP(), INTERVAL 1 DAY))", [u, createHash("sha256").update(t).digest("hex")]); }
});
afterEach(() => { definirEnviador(null); process.env = { ...guardado }; });
afterAll(closePool);

describe("POST /api/push/enviar (agendador)", () => {
  it("só aceita POST", async () => {
    for (const m of [enviarGet, enviarPut, enviarDelete]) { const r = await m(); expect(r.status).toBe(405); expect(r.headers.get("allow")).toBe("POST"); }
  });
  it("sem CRON_SECRET configurado (ou curto) o endpoint fica indisponível", async () => {
    delete process.env.CRON_SECRET; expect((await enviar(post(`Bearer ${SEGREDO}`))).status).toBe(503);
    process.env.CRON_SECRET = "curto"; expect((await enviar(post("Bearer curto"))).status).toBe(503);
  });
  it("rejeita chamadas sem credencial, com esquema errado ou segredo incorreto (401)", async () => {
    process.env.CRON_SECRET = SEGREDO;
    for (const a of [undefined, "", "Basic abc", `Bearer ${SEGREDO}x`, "Bearer ", SEGREDO, "bearer " + SEGREDO]) expect((await enviar(post(a))).status, String(a)).toBe(401);
  });
  it("sem VAPID: gera lembretes mas devolve 503 explícito", async () => {
    process.env.CRON_SECRET = SEGREDO; delete process.env.VAPID_PUBLIC_KEY; delete process.env.VAPID_PRIVATE_KEY; delete process.env.VAPID_SUBJECT;
    const r = await enviar(post(`Bearer ${SEGREDO}`)); expect(r.status).toBe(503);
    expect((await r.json()).erro).toMatch(/VAPID/); expect(r.headers.get("cache-control")).toBe("no-store");
  });
  it("com tudo configurado: 200, entrega pendentes e é idempotente", async () => {
    process.env.CRON_SECRET = SEGREDO; process.env.VAPID_PUBLIC_KEY = "x"; process.env.VAPID_PRIVATE_KEY = "y"; process.env.VAPID_SUBJECT = "mailto:a@b.co";
    let n = 0; definirEnviador(async () => { n++; return { statusCode: 201 }; });
    tokenAtual = tokens.get(ana)!; expect((await inscrever(req("/api/push/inscrever", { method: "POST", ...json(sub, { origin: "http://localhost" }) }))).status).toBe(201);
    await notificar([ana], { tipo: "sistema", titulo: "Pelo cron", dedupeKey: "cron1" });
    const r = await enviar(post(`Bearer ${SEGREDO}`)); expect(r.status).toBe(200);
    const corpo = await r.json(); expect(corpo.ok).toBe(true); expect(corpo.push.enviadas).toBe(1); expect(n).toBe(1);
    expect((await (await enviar(post(`Bearer ${SEGREDO}`))).json()).push.enviadas).toBe(0); expect(n).toBe(1);
  });
});

describe("inscrição de dispositivo (sessão obrigatória)", () => {
  it("sem sessão: 401; origem externa: 403; corpo inválido: 400/422", async () => {
    tokenAtual = null; expect((await inscrever(req("/api/push/inscrever", { method: "POST", ...json(sub) }))).status).toBe(401);
    expect((await desinscrever(req("/api/push/inscrever", { method: "DELETE", ...json({ endpoint: sub.endpoint }) }))).status).toBe(401);
    tokenAtual = tokens.get(bia)!;
    expect((await inscrever(req("/api/push/inscrever", { method: "POST", ...json(sub, { origin: "https://evil.example" }) }))).status).toBe(403);
    expect((await inscrever(req("/api/push/inscrever", { method: "POST", body: "{nao json", headers: { "content-type": "application/json" } }))).status).toBe(400);
    expect((await inscrever(req("/api/push/inscrever", { method: "POST", ...json({ endpoint: "http://inseguro.org", keys: sub.keys }) }))).status).toBe(422);
  });
  it("registra e cancela apenas o próprio dispositivo", async () => {
    tokenAtual = tokens.get(bia)!;
    expect((await inscrever(req("/api/push/inscrever", { method: "POST", ...json({ ...sub, endpoint: "https://push.exemplo.org/send/bia" }) }))).status).toBe(201);
    tokenAtual = tokens.get(ana)!;
    await desinscrever(req("/api/push/inscrever", { method: "DELETE", ...json({ endpoint: "https://push.exemplo.org/send/bia" }) })); // ana tenta cancelar o da bia
    expect((await query<any>("SELECT COUNT(*) n FROM push_subscriptions WHERE user_id = ?", [bia]))[0].n).toBe(1);
    tokenAtual = tokens.get(bia)!;
    expect((await desinscrever(req("/api/push/inscrever", { method: "DELETE", ...json({ endpoint: "https://push.exemplo.org/send/bia" }) }))).status).toBe(200);
    expect((await query<any>("SELECT COUNT(*) n FROM push_subscriptions WHERE user_id = ?", [bia]))[0].n).toBe(0);
  });
  it("chave pública exige sessão e nunca expõe a privada", async () => {
    process.env.VAPID_PUBLIC_KEY = "PUB"; process.env.VAPID_PRIVATE_KEY = "PRIV-SECRETA";
    tokenAtual = null; expect((await chave()).status).toBe(401);
    tokenAtual = tokens.get(ana)!; const r = await chave(); const t = await r.text();
    expect(JSON.parse(t).chave).toBe("PUB"); expect(t).not.toContain("PRIV-SECRETA");
  });
});
