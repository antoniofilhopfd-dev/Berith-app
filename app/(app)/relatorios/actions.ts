"use server";

import { guarded } from "@/lib/auth/guard";
import { limitar } from "@/lib/auth/limite";
import { DomainError } from "@/lib/services/errors";
import { sincronizarContaAgora } from "@/lib/services/agendamento";
import { informarSeguidoresMes } from "@/lib/services/desempenho";

/** Busca agora os dados do Instagram (posts, seguidores, alcance) e mostra o motivo se a Meta recusar. */
export const atualizarInstagramAction = guarded(async (u) => {
  const lim = limitar(`sync-ig:${u.id}`, 5, 10 * 60_000);
  if (!lim.ok) throw new DomainError(`Muitas atualizações seguidas. Tente de novo em ${lim.esperarSeg}s.`);
  const r = await sincronizarContaAgora(u.id, "instagram");
  if (r.erro && r.posts === 0 && r.meses === 0) throw new DomainError(r.erro);
  return { ok: `${r.posts} post(s) e ${r.meses} mês(es) atualizados${r.contas > 1 ? ` em ${r.contas} contas` : ""}.${r.erro ? ` Aviso: ${r.erro}` : ""}` };
}, ["/relatorios"]);

/** Carrega até 12 meses de histórico de métricas da conta (a Meta só entrega o que ainda guarda). */
export const carregarHistoricoAction = guarded(async (u) => {
  const lim = limitar(`hist-ig:${u.id}`, 3, 10 * 60_000);
  if (!lim.ok) throw new DomainError(`Muitas atualizações seguidas. Tente de novo em ${lim.esperarSeg}s.`);
  const r = await sincronizarContaAgora(u.id, "instagram", new Date(), 12);
  if (r.erro && r.meses === 0) throw new DomainError(r.erro);
  return { ok: `${r.meses} mês(es) carregados, ${r.posts} post(s) atualizados.${r.erro ? ` Aviso: ${r.erro}` : ""}` };
}, ["/relatorios"]);

/** Seguidores de um mês passado sem coleta automática (a Meta não entrega histórico de seguidores). */
export const informarSeguidoresAction = guarded(async (u, f) => {
  const g = (k: string) => { const v = f.get(k); return typeof v === "string" ? v.trim() : ""; };
  await informarSeguidoresMes(u.id, g("conta") || undefined, g("mes"), Math.floor(Number(g("seguidores").replace(/\./g, ""))));
  return { ok: "Seguidores do mês registrados." };
}, ["/relatorios/ranking", "/relatorios"]);
