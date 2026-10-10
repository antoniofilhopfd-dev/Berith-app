"use server";

import { z } from "zod";
import { guarded } from "@/lib/auth/guard";
import { TIPOS_NOTIFICACAO, marcarTodasLidas, salvarPreferencias } from "@/lib/services/notificacoes";

export const marcarTodasAction = guarded(async (u) => { await marcarTodasLidas(u.id); return { ok: "Tudo marcado como lido." }; }, ["/notificacoes"]);

export const preferenciasAction = guarded(async (u, f) => {
  const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Horário inválido").or(z.literal("")).transform((v) => v || null);
  const ini = hhmm.parse(String(f.get("silencioInicio") ?? "")), fim = hhmm.parse(String(f.get("silencioFim") ?? ""));
  if (!!ini !== !!fim) throw new z.ZodError([{ code: "custom", message: "Informe início e fim do horário de silêncio.", path: [] }]);
  await salvarPreferencias(u.id, { pushAtivo: f.get("pushAtivo") === "on", silencioInicio: ini, silencioFim: fim, tipos: Object.fromEntries(TIPOS_NOTIFICACAO.map((t) => [t, f.get(`tipo_${t}`) === "on"])) });
  return { ok: "Preferências salvas." };
}, ["/notificacoes"]);
