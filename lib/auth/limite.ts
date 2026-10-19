/**
 * Limitador de taxa em memória (janela deslizante) para rotas que gravam arquivos ou geram relatórios pesados.
 * O app roda em uma única instância Node na hospedagem; se houver várias, o limite vale por instância.
 * Login e troca de senha usam limites persistidos no banco (sobrevivem a reinícios).
 */
const registros = new Map<string, number[]>();

export function limitar(chave: string, max: number, janelaMs: number, agora = Date.now()): { ok: boolean; esperarSeg: number } {
  const recentes = (registros.get(chave) ?? []).filter((t) => agora - t < janelaMs);
  if (recentes.length >= max) {
    registros.set(chave, recentes);
    return { ok: false, esperarSeg: Math.ceil((janelaMs - (agora - recentes[0])) / 1000) };
  }
  recentes.push(agora);
  registros.set(chave, recentes);
  if (registros.size > 5000) for (const [k, v] of registros) if (!v.some((t) => agora - t < janelaMs)) registros.delete(k); // evita crescimento sem fim
  return { ok: true, esperarSeg: 0 };
}
export const _limparLimites = () => registros.clear();
