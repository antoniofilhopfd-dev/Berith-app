"use server";

import { z } from "zod";
import { ZodError } from "zod";
import { baseUrl, type ActionResult } from "./guard";
import { clientInfo } from "./session";
import { emailSchema, senhaNovaSchema } from "@/lib/validation/auth";
import { requestPasswordReset, resetPassword } from "@/lib/services/senha";
import { acceptInvitation } from "@/lib/services/membros";
import { DomainError } from "@/lib/services/errors";

async function run(fn: () => Promise<ActionResult>): Promise<ActionResult> {
  try { return await fn(); } catch (e) {
    if (e instanceof DomainError) return { erro: e.message };
    if (e instanceof ZodError) return { erro: e.issues[0]?.message ?? "Dados inválidos." };
    console.error("[public-action]", e instanceof Error ? e.message : "erro");
    return { erro: "Não foi possível concluir. Tente novamente." };
  }
}

const confirma = z.object({ senha: senhaNovaSchema, confirmar: z.string() }).refine((d) => d.senha === d.confirmar, { message: "As senhas não conferem." });

export async function solicitarRedefinicaoAction(_p: ActionResult, f: FormData) {
  return run(async () => {
    const email = emailSchema.parse(f.get("email"));
    const { ip } = await clientInfo();
    await requestPasswordReset(email, await baseUrl(), ip);
    // Mesma resposta exista ou não o e-mail.
    return { ok: "Se o e-mail estiver cadastrado, enviaremos as instruções. Caso não receba, peça à coordenação um link de redefinição." };
  });
}

export async function redefinirSenhaAction(_p: ActionResult, f: FormData) {
  return run(async () => {
    const d = confirma.parse({ senha: f.get("senha"), confirmar: f.get("confirmar") });
    const { ip } = await clientInfo();
    await resetPassword(String(f.get("token") ?? ""), d.senha, ip);
    return { ok: "Senha alterada. Você já pode entrar." };
  });
}

export async function aceitarConviteAction(_p: ActionResult, f: FormData) {
  return run(async () => {
    const d = confirma.parse({ senha: f.get("senha"), confirmar: f.get("confirmar") });
    const { ip } = await clientInfo();
    await acceptInvitation(String(f.get("token") ?? ""), d.senha, ip);
    return { ok: "Cadastro recebido! Aguarde a aprovação da coordenação para acessar o aplicativo." };
  });
}
