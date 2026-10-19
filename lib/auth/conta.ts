import { cookies } from "next/headers";

/** Conta do Instagram escolhida no seletor do topo (preferência do navegador; vale para os relatórios). */
export const CONTA_COOKIE = "conta_ig";

export async function contaPreferida(): Promise<string | undefined> {
  try {
    const v = (await cookies()).get(CONTA_COOKIE)?.value;
    return v && /^\d{1,40}$/.test(v) ? v : undefined;
  } catch { return undefined; } // fora de uma requisição (testes/scripts)
}
