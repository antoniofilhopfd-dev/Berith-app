"use server";

import { z } from "zod";
import { guarded, baseUrl } from "@/lib/auth/guard";
import { approveUser, createInvitation, rejectUser, setUserStatus, updateOwnProfile } from "@/lib/services/membros";
import { adminCreateReset } from "@/lib/services/senha";
import { conviteSchema, idSchema } from "@/lib/validation/estruturas";

export const convidarAction = guarded(async (u, f) => {
  const d = conviteSchema.parse(Object.fromEntries(f));
  const inv = await createInvitation(u.id, d);
  return { ok: "Convite criado. Ele expira em 7 dias.", link: `${await baseUrl()}/convite/${inv.token}` };
}, ["/membros"]);

export const aprovarAction = guarded(async (u, f) => {
  await approveUser(u.id, idSchema.parse(f.get("userId")));
  return { ok: "Membro aprovado." };
}, ["/membros", "/estruturas"]);

export const rejeitarAction = guarded(async (u, f) => {
  await rejectUser(u.id, idSchema.parse(f.get("userId")));
  return { ok: "Solicitação recusada." };
}, ["/membros"]);

export const situacaoAction = guarded(async (u, f) => {
  const d = z.object({ userId: idSchema, status: z.enum(["ativo", "suspenso"]) }).parse(Object.fromEntries(f));
  await setUserStatus(u.id, d.userId, d.status);
  return { ok: d.status === "ativo" ? "Acesso reativado." : "Acesso suspenso; sessões encerradas." };
}, ["/membros"]);

export const gerarLinkSenhaAction = guarded(async (u, f) => {
  const token = await adminCreateReset(u.id, idSchema.parse(f.get("userId")));
  return { ok: "Link de redefinição gerado (válido por 60 minutos).", link: `${await baseUrl()}/redefinir-senha/${token}` };
});

export const perfilAction = guarded(async (u, f) => {
  const telefone = z.string().trim().max(30).regex(/^[0-9()+\-\s]*$/, "Telefone inválido").parse(String(f.get("telefone") ?? "")) || null;
  await updateOwnProfile(u.id, { telefone });
  return { ok: "Dados atualizados." };
}, ["/perfil"]);
