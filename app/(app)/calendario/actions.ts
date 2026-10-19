"use server";

import { z, ZodError } from "zod";
import { revalidatePath } from "next/cache";
import { guarded } from "@/lib/auth/guard";
import { requireUser } from "@/lib/auth/session";
import { isDate, localToUtc } from "@/lib/time";
import { moverParaDia } from "@/lib/services/agendamento";
import { criar } from "@/lib/services/publicacoes";
import { lerPublicacao } from "@/lib/validation/editorial";
import { DomainError, NotFoundError } from "@/lib/services/errors";
import { ForbiddenError } from "@/lib/permissions";
import { lerConfig } from "@/lib/services/configuracoes";
import { redirect } from "next/navigation";
import { REDES_ATIVAS } from "@/lib/editorial";

/** Arrastar e soltar: move a publicação para outro dia mantendo o horário. */
export async function moverPublicacaoAction(id: number, dia: string): Promise<{ erro?: string }> {
  try {
    const u = await requireUser();
    if (!Number.isInteger(id) || id <= 0 || !isDate(dia)) return { erro: "Dados inválidos." };
    await moverParaDia(u.id, id, dia);
    revalidatePath("/calendario"); revalidatePath("/producao"); revalidatePath("/publicacoes");
    return {};
  } catch (e) {
    if (e instanceof DomainError) return { erro: e.message };
    if (e instanceof ForbiddenError || e instanceof NotFoundError) return { erro: "Você não tem permissão para mover esta publicação." };
    if (e instanceof ZodError) return { erro: "Dados inválidos." };
    return { erro: "Não foi possível mover." };
  }
}

/** Criação rápida ao clicar em um dia: rascunho com título, formato e redes; abre o editor completo em seguida. */
export const criarRapidaAction = guarded(async (u, f) => {
  const dia = z.string().refine(isDate, "Data inválida").parse(f.get("dia"));
  const cfg = await lerConfig();
  const fd = new FormData();
  fd.set("titulo", String(f.get("titulo") ?? "")); fd.set("formato", String(f.get("formato") ?? "post"));
  for (const r of f.getAll("redes")) if (REDES_ATIVAS.includes(r as never)) fd.append("redes", String(r));
  fd.set("hashtags", cfg.hashtagsPadrao);
  const { dados } = lerPublicacao(fd);
  const hora = cfg.horariosSugeridos[0] ?? "09:00";
  const id = await criar(u.id, { ...dados, responsavelId: u.id }, { prazo: null, publicarEm: localToUtc(dia, hora) });
  redirect(`/producao/${id}`);
}, ["/calendario", "/producao"]);
