"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/session";
import { CONTA_COOKIE } from "@/lib/auth/conta";
import { contasInstagram } from "@/lib/integracoes/contas";

/** Guarda a conta do Instagram escolhida no seletor do topo. Só aceita contas realmente conectadas. */
export async function trocarContaAction(igId: string): Promise<{ ok: boolean }> {
  await requireUser();
  const valida = (await contasInstagram()).some((c) => c.igId === igId);
  if (!valida) return { ok: false };
  (await cookies()).set(CONTA_COOKIE, igId, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 365 * 86400 });
  revalidatePath("/", "layout");
  return { ok: true };
}
