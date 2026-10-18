"use server";

import { z } from "zod";
import { guarded } from "@/lib/auth/guard";
import * as A from "@/lib/services/agendamento";
import { dataHora } from "@/lib/validation/editorial";

const id = z.coerce.number().int().positive();
const CAMINHOS = ["/publicacoes", "/producao", "/calendario", "/aprovacoes", "/"];

function quando(f: FormData): Date {
  const d = dataHora(String(f.get("data") ?? ""), String(f.get("hora") ?? ""), "Publicação");
  if (!d) throw new z.ZodError([{ code: "custom", message: "Informe a data e o horário.", path: [] }]);
  return d;
}

export const agendarAction = guarded(async (u, f) => { await A.agendar(u.id, id.parse(f.get("id")), quando(f)); return { ok: "Publicação agendada." }; }, CAMINHOS);
export const reagendarAction = guarded(async (u, f) => { await A.reagendar(u.id, id.parse(f.get("id")), quando(f)); return { ok: "Horário atualizado." }; }, CAMINHOS);
export const desagendarAction = guarded(async (u, f) => { await A.desagendar(u.id, id.parse(f.get("id"))); return { ok: "Agendamento cancelado; o conteúdo voltou para “Aprovado”." }; }, CAMINHOS);
export const cancelarRedeAction = guarded(async (u, f) => { await A.cancelarRede(u.id, id.parse(f.get("redeId"))); return { ok: "Rede cancelada." }; }, CAMINHOS);
export const reprocessarAction = guarded(async (u, f) => { await A.reprocessar(u.id, id.parse(f.get("redeId"))); return { ok: "Reprocessamento enfileirado: será tentado na próxima execução do agendador." }; }, CAMINHOS);
export const publicadaManualAction = guarded(async (u, f) => {
  await A.marcarPublicadaManual(u.id, id.parse(f.get("redeId")), { url: String(f.get("url") ?? "") });
  return { ok: "Registrado como publicado manualmente (publicação assistida)." };
}, CAMINHOS);
