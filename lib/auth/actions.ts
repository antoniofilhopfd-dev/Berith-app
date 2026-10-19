"use server";

import { redirect } from "next/navigation";
import { authenticate } from "./login";
import { cookies } from "next/headers";
import { autenticarCodigo, hashDispositivo, modoLogin, registrarDispositivo } from "./codigo";
import { DEV_COOKIE, safeNext } from "./constants";
import { clientInfo, createSession, destroySession, getSessionUser } from "./session";
import { loginSchema } from "@/lib/validation/auth";
import { audit } from "@/lib/services/audit";

export type LoginState = { erro?: string; email?: string };

export async function loginAction(_prev: LoginState, form: FormData): Promise<LoginState> {
  if ((await modoLogin()) === "codigo") return { erro: "A entrada é feita somente pelo código de acesso." };
  const emailDigitado = String(form.get("email") ?? "").slice(0, 190);
  const parsed = loginSchema.safeParse({ email: form.get("email"), senha: form.get("senha") });
  if (!parsed.success) return { erro: parsed.error.issues[0]?.message ?? "Dados inválidos", email: emailDigitado };
  const { ip } = await clientInfo();
  const r = await authenticate(parsed.data.email, parsed.data.senha, ip);
  if (!r.ok) {
    return {
      email: emailDigitado,
      erro: r.motivo === "bloqueado" ? "Muitas tentativas. Aguarde alguns minutos e tente novamente." : "E-mail ou senha incorretos.",
    };
  }
  await createSession(r.userId);
  redirect(safeNext(form.get("next")));
}

/** Entrada por código de acesso (XXXX-XXXX). */
export async function loginCodigoAction(_prev: LoginState, form: FormData): Promise<LoginState> {
  const { ip } = await clientInfo();
  const jar = await cookies();
  const dev = jar.get(DEV_COOKIE)?.value;
  const r = await autenticarCodigo(String(form.get("codigo") ?? "").slice(0, 40), ip, undefined, hashDispositivo(dev));
  if (!r.ok) return { erro: r.motivo === "bloqueado" ? "Muitas tentativas. Aguarde alguns minutos e tente novamente." : "Código inválido. Confira com quem administra o app." };
  const novo = await registrarDispositivo(r.userId, dev);
  jar.set(DEV_COOKIE, novo, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 365 * 86400 });
  await createSession(r.userId);
  redirect(safeNext(form.get("next")));
}

export async function logoutAction() {
  const u = await getSessionUser();
  await destroySession();
  if (u) await audit(u.id, "logout");
  redirect("/login");
}
