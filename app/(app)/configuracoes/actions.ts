"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { guarded, baseUrl } from "@/lib/auth/guard";
import { createSession, hashSessaoAtual } from "@/lib/auth/session";
import { senhaNovaSchema } from "@/lib/validation/auth";
import { atualizarPerfil } from "@/lib/services/equipe";
import { encerrarOutrasSessoes, encerrarSessao, trocarSenha } from "@/lib/services/senha";
import { salvarConfig } from "@/lib/services/configuracoes";
import { desconectar, iniciarConexao, removerContaInstagram } from "@/lib/integracoes/contas";
import { REDES, REDES_ATIVAS, type Rede } from "@/lib/editorial";
import { isTime } from "@/lib/time";
import { assertCan } from "@/lib/permissions";
import { definirModoLogin } from "@/lib/auth/codigo";
import { executarAgendador } from "@/lib/services/agendador";

const g = (f: FormData, k: string) => { const v = f.get(k); return typeof v === "string" ? v : ""; };

export const perfilAction = guarded(async (u, f) => {
  const d = z.object({ nome: z.string().trim().min(2, "Informe seu nome").max(150), telefone: z.string().trim().max(30).regex(/^[0-9()+\-\s]*$/, "Telefone inválido").transform((v) => v || null) }).parse({ nome: g(f, "nome"), telefone: g(f, "telefone") });
  await atualizarPerfil(u.id, d);
  return { ok: "Perfil atualizado." };
}, ["/configuracoes/perfil", "/equipe"]);

export const senhaAction = guarded(async (u, f) => {
  const d = z.object({ atual: z.string().min(1, "Informe a senha atual").max(128), nova: senhaNovaSchema, confirmar: z.string() }).refine((x) => x.nova === x.confirmar, { message: "As senhas não conferem." }).parse({ atual: g(f, "atual"), nova: g(f, "nova"), confirmar: g(f, "confirmar") });
  await trocarSenha(u.id, d.atual, d.nova);
  await createSession(u.id); // as demais sessões foram encerradas; esta continua com um novo token
  return { ok: "Senha alterada. Os outros dispositivos foram desconectados." };
}, ["/configuracoes/seguranca"]);

export const encerrarSessaoAction = guarded(async (u, f) => { await encerrarSessao(u.id, z.coerce.number().int().positive().parse(f.get("id"))); return { ok: "Sessão encerrada." }; }, ["/configuracoes/seguranca"]);
export const encerrarOutrasAction = guarded(async (u) => { await encerrarOutrasSessoes(u.id, await hashSessaoAtual()); return { ok: "Os outros dispositivos foram desconectados." }; }, ["/configuracoes/seguranca"]);

export const ministerioAction = guarded(async (u, f) => {
  const horarios = g(f, "horariosSugeridos").split(/[,\s]+/).map((h) => h.trim()).filter(Boolean);
  if (horarios.some((h) => !isTime(h))) throw new z.ZodError([{ code: "custom", message: "Horários sugeridos: use HH:MM separados por vírgula.", path: [] }]);
  await salvarConfig(u.id, {
    nomeMinisterio: g(f, "nomeMinisterio"), exigirAprovacao: f.get("exigirAprovacao") === "on", impedirAutoaprovacao: f.get("impedirAutoaprovacao") === "on",
    hashtagsPadrao: g(f, "hashtagsPadrao"), horariosSugeridos: horarios, lembretePrazoHoras: Number(g(f, "lembretePrazoHoras")) || 24,
  });
  return { ok: "Configurações salvas." };
}, ["/configuracoes/ministerio", "/producao", "/"]);

export const conectarAction = guarded(async (u, f) => {
  const rede = z.enum(REDES_ATIVAS as unknown as [Rede, ...Rede[]]).parse(f.get("rede"));
  redirect(await iniciarConexao(u.id, rede, await baseUrl()));
}, []);
export const desconectarAction = guarded(async (u, f) => { await desconectar(u.id, z.enum(REDES).parse(f.get("rede"))); return { ok: "Rede desconectada. Os tokens foram apagados." }; }, ["/configuracoes/redes", "/publicacoes"]);

export const executarAgendadorAction = guarded(async (u) => {
  await assertCan(u.id, "configuracoes", "gerir");
  const r = await executarAgendador("manual", await baseUrl());
  return { ok: "ocupado" in r && r.ocupado ? "Já havia uma rodada em andamento. Tente de novo em instantes." : "Agendador executado agora." };
}, ["/configuracoes/geral"]);

export const removerContaAction = guarded(async (u, f) => {
  await removerContaInstagram(u.id, z.string().regex(/^\d{1,40}$/, "Conta inválida.").parse(f.get("igId")));
  return { ok: "Conta removida e dados dela apagados." };
}, ["/configuracoes/redes", "/relatorios"]);

export const modoLoginAction = guarded(async (u, f) => {
  await definirModoLogin(u.id, z.enum(["codigo", "ambos"]).parse(f.get("modo")));
  return { ok: "Forma de entrada salva." };
}, ["/configuracoes/seguranca"]);
