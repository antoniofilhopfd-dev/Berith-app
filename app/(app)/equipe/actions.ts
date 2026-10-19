"use server";

import { z } from "zod";
import { guarded, baseUrl } from "@/lib/auth/guard";
import { emailSchema } from "@/lib/validation/auth";
import { PERFIS } from "@/lib/permissions";
import * as E from "@/lib/services/equipe";
import { sendMail } from "@/lib/services/mailer";
import { adminCreateReset } from "@/lib/services/senha";
import { definirCodigo, emitirCodigo, revogarCodigo } from "@/lib/auth/codigo";
import { anonimizarPessoa } from "@/lib/services/lgpd";

const id = z.coerce.number().int().positive();

export const convidarAction = guarded(async (u, f) => {
  const d = z.object({ nome: z.string().trim().min(2, "Informe o nome").max(150), email: emailSchema, perfil: z.enum(PERFIS) }).parse({ nome: f.get("nome"), email: f.get("email"), perfil: f.get("perfil") });
  const c = await E.criarConvite(u.id, d);
  const link = `${await baseUrl()}/convite/${c.token}`;
  let enviado = false;
  try { await sendMail(d.email, "Convite — Berith, Ministério de Comunicação", `Olá, ${d.nome}!\n\nVocê foi convidado(a) para o aplicativo do Ministério de Comunicação da Nova Berith.\nCrie sua senha em (válido por 7 dias):\n${link}`); enviado = true; } catch { /* sem SMTP: o link é mostrado ao administrador */ }
  return { ok: enviado ? "Convite enviado por e-mail. O link também está abaixo, caso precise reenviar." : "Convite criado. O envio por e-mail não está configurado: entregue o link abaixo por um canal seguro.", link };
}, ["/equipe"]);
export const aprovarAction = guarded(async (u, f) => { await E.aprovarPessoa(u.id, id.parse(f.get("id"))); return { ok: "Pessoa aprovada." }; }, ["/equipe"]);
export const rejeitarAction = guarded(async (u, f) => { await E.rejeitarPessoa(u.id, id.parse(f.get("id"))); return { ok: "Cadastro recusado." }; }, ["/equipe"]);
export const perfilEquipeAction = guarded(async (u, f) => {
  await E.definirPerfil(u.id, id.parse(f.get("id")), z.enum([...PERFIS, "nenhum"]).parse(f.get("perfil")));
  return { ok: "Perfil atualizado." };
}, ["/equipe", "/"]);
export const situacaoAction = guarded(async (u, f) => { await E.alterarSituacao(u.id, id.parse(f.get("id")), z.enum(["ativo", "suspenso"]).parse(f.get("status"))); return { ok: "Situação atualizada." }; }, ["/equipe"]);
export const linkSenhaAction = guarded(async (u, f) => { const t = await adminCreateReset(u.id, id.parse(f.get("id"))); return { ok: "Link de redefinição gerado (válido por 60 minutos).", link: `${await baseUrl()}/redefinir-senha/${t}` }; }, []);
export const codigoAcessoAction = guarded(async (u, f) => {
  const r = await emitirCodigo(u.id, id.parse(f.get("id")));
  return { ok: `Código de ${r.nome} gerado. Os acessos anteriores dessa pessoa foram encerrados.`, segredo: r.codigo };
}, ["/equipe"]);
export const revogarCodigoAction = guarded(async (u, f) => { await revogarCodigo(u.id, id.parse(f.get("id"))); return { ok: "Código revogado. A pessoa não consegue mais entrar por código." }; }, ["/equipe"]);
export const definirCodigoAction = guarded(async (u, f) => {
  const r = await definirCodigo(u.id, id.parse(f.get("id")), String(f.get("codigo") ?? ""));
  return { ok: `Código de ${r.nome} atualizado. Os acessos anteriores dessa pessoa foram encerrados.` };
}, ["/equipe"]);
export const anonimizarAction = guarded(async (u, f) => {
  if (f.get("confirmo") !== "on") throw new z.ZodError([{ code: "custom", message: "Marque a confirmação para anonimizar.", path: [] }]);
  await anonimizarPessoa(u.id, id.parse(f.get("id")));
  return { ok: "Pessoa anonimizada: nome, e-mail e acessos foram removidos; o histórico editorial foi mantido sem identificação." };
}, ["/equipe"]);
