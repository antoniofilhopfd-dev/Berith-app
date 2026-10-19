import { comTrava } from "@/lib/db";
import { baseUrl } from "@/lib/auth/guard";
import { getSetting, setSetting } from "./configuracoes";
import { coletarMetricas, gerarLembretes, processarFila } from "./agendamento";
import { processarPush, pushConfigurado } from "./push";

export type Origem = "cron" | "app" | "manual";
const SEGUNDOS_SEM_CRON = 8 * 60; // cron previsto a cada 5 min: passou disso, o app assume
let ultimaChecagem = 0;
let ultimoRegistroNegado = 0;
/** Somente testes: zera o limitador de checagens. */
export const __zerarLimitadores = () => { ultimaChecagem = 0; ultimoRegistroNegado = 0; };

/**
 * Uma rodada do agendador: fila de publicações → lembretes → métricas/posts (na primeira janela de cada hora) → push.
 * Trava no banco: duas rodadas simultâneas (cron + app aberto) nunca rodam juntas.
 */
export async function executarAgendador(origem: Origem, base?: string) {
  const r = await comTrava("agendador", async () => {
    const seguro = async <T,>(fn: () => Promise<T>): Promise<T | { erro: string }> => {
      try { return await fn(); } catch (e) { console.error("[agendador]", e instanceof Error ? e.message : "erro"); return { erro: "falhou" }; }
    };
    const agora = new Date().toISOString();
    await seguro(() => setSetting("agendador_ultima_execucao", agora));
    if (origem === "cron") await seguro(() => setSetting("cron_ultima_execucao", agora));
    const url = base ?? (await baseUrl());
    const fila = await seguro(() => processarFila(url));
    const lembretes = await seguro(() => gerarLembretes());
    // Métricas: uma vez por hora (cada rede limita as consultas; a coleta ainda respeita a própria janela de 6 h).
    const horaAtual = agora.slice(0, 13);
    const jaFez = (await getSetting("agendador_metricas_hora")) === horaAtual;
    const metricas = jaFez ? { pulado: true } : await seguro(async () => { await setSetting("agendador_metricas_hora", horaAtual); return coletarMetricas(); });
    const push = pushConfigurado() ? await seguro(() => processarPush()) : { pulado: "Web Push não configurado" };
    return { ok: true, fila, lembretes, metricas, push };
  });
  return r.ocupado ? { ok: true, ocupado: true } : r.valor;
}

/**
 * Rede de segurança: se o cron externo falhar ou atrasar, quem abrir o app dispara a rodada (em segundo plano).
 * Não substitui o cron — com o app fechado nada roda — mas evita publicações atrasadas enquanto alguém usa o sistema.
 */
export async function garantirAgendador(): Promise<void> {
  const app = process.env.APP_URL;
  if (!app) return; // sem endereço público não dá para montar as URLs assinadas de mídia
  const t = Date.now();
  if (t - ultimaChecagem < 60_000) return; // no máximo uma checagem por minuto neste processo
  ultimaChecagem = t;
  try {
    const ult = await getSetting("agendador_ultima_execucao");
    if (ult && t - new Date(ult).getTime() < SEGUNDOS_SEM_CRON * 1000) return;
    await executarAgendador("app", app.replace(/\/$/, ""));
  } catch (e) { console.error("[agendador] verificação falhou:", e instanceof Error ? e.message : "erro"); }
}


/** Registra que o cron chamou com segredo errado/ausente (diagnóstico na tela; no máximo 1 gravação por minuto). */
export async function registrarChamadaNegada(motivo: "segredo" | "nao_configurado") {
  const t = Date.now();
  if (t - ultimoRegistroNegado < 60_000) return;
  ultimoRegistroNegado = t;
  try { await setSetting("cron_negado_em", JSON.stringify({ quando: new Date().toISOString(), motivo })); } catch { /* diagnóstico é opcional */ }
}
