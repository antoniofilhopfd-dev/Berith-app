import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { ZodError } from "zod";
import { requireUser, AuthError, type SessionUser } from "./session";
import { ForbiddenError } from "@/lib/permissions";
import { DomainError, NotFoundError } from "@/lib/services/errors";

export type ActionResult = { erro?: string; ok?: string; link?: string };
export type FormAction = (prev: ActionResult, form: FormData) => Promise<ActionResult>;

/**
 * Envolve Server Actions: exige sessão válida (revalidada no banco) e converte falhas esperadas
 * em mensagens seguras. Autorização fina continua nos serviços. Erros inesperados não vazam detalhes.
 */
export function guarded(
  fn: (user: SessionUser, form: FormData) => Promise<Omit<ActionResult, "erro"> | void>,
  revalidate: string[] = [],
): FormAction {
  return async (_prev, form) => {
    try {
      const user = await requireUser();
      const r = (await fn(user, form)) ?? {};
      for (const p of revalidate) revalidatePath(p);
      return r;
    } catch (e) {
      if (e instanceof AuthError) return { erro: "Sessão expirada. Entre novamente." };
      if (e instanceof ForbiddenError || e instanceof NotFoundError) return { erro: "Você não tem permissão para esta ação." };
      if (e instanceof DomainError) return { erro: e.message };
      if (e instanceof ZodError) return { erro: e.issues[0]?.message ?? "Dados inválidos." };
      console.error("[action]", e instanceof Error ? e.message : "erro");
      return { erro: "Não foi possível concluir. Tente novamente." };
    }
  };
}

export async function baseUrl() {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, "");
  const h = await headers();
  const proto = h.get("x-forwarded-proto") ?? "http";
  return `${proto}://${h.get("host")}`;
}
