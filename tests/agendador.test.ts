import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { closePool, comTrava, query } from "@/lib/db";
import { executarAgendador, garantirAgendador, registrarChamadaNegada, __zerarLimitadores } from "@/lib/services/agendador";
import { getSetting, setSetting } from "@/lib/services/configuracoes";
import { resetTestDb } from "./helpers";

const BASE = "https://app.exemplo.org";
beforeAll(async () => { await resetTestDb(); process.env.TOKEN_ENC_KEY = "chave-de-teste-para-cifrar-tokens-0123456789"; });
afterAll(closePool);
beforeEach(() => { __zerarLimitadores(); delete process.env.APP_URL; });

describe("agendador", () => {
  it("rodada do cron registra as duas marcas; rodada manual só a geral", async () => {
    await executarAgendador("manual", BASE);
    expect(await getSetting("agendador_ultima_execucao")).not.toBe("");
    expect(await getSetting("cron_ultima_execucao")).toBe("");
    await executarAgendador("cron", BASE);
    expect(await getSetting("cron_ultima_execucao")).not.toBe("");
  });
  it("não roda duas rodadas ao mesmo tempo (cron + app aberto)", async () => {
    const r = await comTrava("agendador", async () => executarAgendador("app", BASE));
    expect(r).toMatchObject({ ocupado: false, valor: { ok: true, ocupado: true } });
  });
  it("coleta de métricas é pedida no máximo uma vez por hora", async () => {
    await setSetting("agendador_metricas_hora", "");
    const a = await executarAgendador("cron", BASE) as { metricas: unknown };
    const b = await executarAgendador("cron", BASE) as { metricas: unknown };
    expect(a.metricas).not.toEqual({ pulado: true });
    expect(b.metricas).toEqual({ pulado: true });
  });
  it("rede de segurança: só assume quando o cron está atrasado e há APP_URL", async () => {
    process.env.APP_URL = BASE;
    await setSetting("agendador_ultima_execucao", new Date().toISOString());
    await garantirAgendador(); // recente: não faz nada
    const recente = await getSetting("agendador_ultima_execucao");
    __zerarLimitadores();
    const velha = new Date(Date.now() - 20 * 60_000).toISOString();
    await setSetting("agendador_ultima_execucao", velha);
    await garantirAgendador(); // atrasado: executa
    expect(new Date(await getSetting("agendador_ultima_execucao")).getTime()).toBeGreaterThan(new Date(velha).getTime());
    expect(recente).not.toBe(velha);
    __zerarLimitadores(); delete process.env.APP_URL;
    await setSetting("agendador_ultima_execucao", velha);
    await garantirAgendador(); // sem APP_URL: não executa
    expect(await getSetting("agendador_ultima_execucao")).toBe(velha);
  });
  it("registra chamada negada do cron para diagnóstico, sem segredos", async () => {
    await registrarChamadaNegada("segredo");
    const v = JSON.parse(await getSetting("cron_negado_em"));
    expect(v.motivo).toBe("segredo"); expect(Object.keys(v).sort()).toEqual(["motivo", "quando"]);
    expect((await query<any>("SELECT COUNT(*) n FROM settings WHERE chave = 'cron_negado_em'"))[0].n).toBe(1);
  });
});
