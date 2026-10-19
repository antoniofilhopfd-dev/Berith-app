"use server";

import { guarded } from "@/lib/auth/guard";
import { limitar } from "@/lib/auth/limite";
import { DomainError } from "@/lib/services/errors";
import { sincronizarContaAgora } from "@/lib/services/agendamento";

/** Busca agora os dados do Instagram (posts, seguidores, alcance) e mostra o motivo se a Meta recusar. */
export const atualizarInstagramAction = guarded(async (u) => {
  const lim = limitar(`sync-ig:${u.id}`, 5, 10 * 60_000);
  if (!lim.ok) throw new DomainError(`Muitas atualizações seguidas. Tente de novo em ${lim.esperarSeg}s.`);
  const r = await sincronizarContaAgora(u.id, "instagram");
  if (r.erro) throw new DomainError(r.erro);
  return { ok: `${r.posts} post(s) do Instagram atualizados.` };
}, ["/relatorios"]);
