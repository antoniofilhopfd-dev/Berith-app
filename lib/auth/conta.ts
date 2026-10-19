import { cookies } from "next/headers";
import { contasInstagram } from "@/lib/integracoes/contas";

/** Conta do Instagram escolhida no seletor do topo (preferência do navegador; vale para os relatórios). */
export const CONTA_COOKIE = "conta_ig";

export async function contaPreferida(): Promise<string | undefined> {
  try {
    const v = (await cookies()).get(CONTA_COOKIE)?.value;
    return v && /^\d{1,40}$/.test(v) ? v : undefined;
  } catch { return undefined; } // fora de uma requisição (testes/scripts)
}

/**
 * Conta do seletor do topo, para filtrar produção, calendário, publicações e painel.
 * Só filtra quando há mais de uma conta conectada (com uma só, nada é escondido). Preferência inválida cai na principal.
 */
export async function contaParaFiltro(): Promise<string | undefined> {
  const contas = await contasInstagram();
  if (contas.length < 2) return undefined;
  const pref = await contaPreferida();
  return (contas.find((c) => c.igId === pref) ?? contas.find((c) => c.principal) ?? contas[0]).igId;
}
