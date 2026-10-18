"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { guarded } from "@/lib/auth/guard";
import { requireUser } from "@/lib/auth/session";
import { lerPublicacao, comentarioSchema, modeloSchema } from "@/lib/validation/editorial";
import * as P from "@/lib/services/publicacoes";
import { DomainError, NotFoundError } from "@/lib/services/errors";
import { ForbiddenError } from "@/lib/permissions";
import { ZodError } from "zod";
import { utcToLocal } from "@/lib/time";

const id = z.coerce.number().int().positive();
const CAMINHOS = ["/producao", "/aprovacoes", "/calendario", "/publicacoes", "/"];

export const salvarPublicacaoAction = guarded(async (u, f) => {
  const { dados, prazo, publicarEm } = lerPublicacao(f);
  const existente = f.get("id") ? id.parse(f.get("id")) : null;
  if (!existente) {
    const novo = await P.criar(u.id, dados, { prazo, publicarEm });
    redirect(`/producao/${novo}`);
  }
  const base = f.get("rev") !== null && f.get("rev") !== "" ? Number(f.get("rev")) : undefined;
  const r = await P.atualizar(u.id, existente, dados, { prazo, publicarEm }, { baseRev: base });
  if (f.get("acao") === "revisao") { await P.enviarParaRevisao(u.id, existente); redirect(`/producao/${existente}`); }
  return { ok: r.invalidou ? "Salvo. Como o conteúdo mudou, a aprovação anterior foi invalidada e será preciso revisar novamente." : "Alterações salvas." };
}, CAMINHOS);

/** Salvamento automático: sem histórico nem versões; devolve a nova revisão para o controle de concorrência. */
export async function autosalvarAction(f: FormData): Promise<{ erro?: string; rev?: number; hora?: string }> {
  try {
    const u = await requireUser();
    const pid = id.parse(f.get("id"));
    const { dados, prazo, publicarEm } = lerPublicacao(f);
    const r = await P.atualizar(u.id, pid, dados, { prazo, publicarEm }, { autosave: true, baseRev: Number(f.get("rev")) });
    return { rev: r.rev, hora: utcToLocal(new Date()).time };
  } catch (e) {
    if (e instanceof DomainError) return { erro: e.message };
    if (e instanceof ForbiddenError || e instanceof NotFoundError) return { erro: "Você não tem permissão para editar." };
    if (e instanceof ZodError) return { erro: e.issues[0]?.message ?? "Dados inválidos." };
    return { erro: "Falha ao salvar." };
  }
}

export const iniciarProducaoAction = guarded(async (u, f) => { await P.iniciarProducao(u.id, id.parse(f.get("id"))); return { ok: "Produção iniciada." }; }, CAMINHOS);
export const enviarRevisaoAction = guarded(async (u, f) => { await P.enviarParaRevisao(u.id, id.parse(f.get("id"))); return { ok: "Enviado para revisão. Os aprovadores foram avisados." }; }, CAMINHOS);
export const cancelarAction = guarded(async (u, f) => { await P.cancelar(u.id, id.parse(f.get("id")), String(f.get("motivo") ?? "").trim().slice(0, 300) || null); return { ok: "Publicação cancelada." }; }, CAMINHOS);
export const reabrirAction = guarded(async (u, f) => { await P.reabrir(u.id, id.parse(f.get("id"))); return { ok: "Reaberta como rascunho." }; }, CAMINHOS);
export const excluirAction = guarded(async (u, f) => { await P.excluir(u.id, id.parse(f.get("id"))); redirect("/producao"); }, CAMINHOS);
export const duplicarAction = guarded(async (u, f) => { const n = await P.duplicar(u.id, id.parse(f.get("id"))); redirect(`/producao/${n}`); }, CAMINHOS);

export const comentarAction = guarded(async (u, f) => {
  const d = comentarioSchema.parse({ texto: f.get("texto"), tipo: f.get("tipo") || "comentario" });
  await P.comentar(u.id, id.parse(f.get("id")), d.texto, d.tipo);
  return { ok: "Comentário publicado." };
}, ["/producao", "/aprovacoes"]);
export const resolverComentarioAction = guarded(async (u, f) => { await P.resolverComentario(u.id, id.parse(f.get("comentarioId"))); return { ok: "Marcado como resolvido." }; }, ["/producao", "/aprovacoes"]);
export const salvarVersaoAction = guarded(async (u, f) => { const n = await P.salvarVersaoManual(u.id, id.parse(f.get("id")), String(f.get("motivo") ?? "").slice(0, 200)); return { ok: `Versão ${n} registrada.` }; }, ["/producao"]);

export const criarModeloDaPublicacaoAction = guarded(async (u, f) => {
  const nome = z.string().trim().min(2, "Dê um nome ao modelo").max(120).parse(f.get("nome"));
  await P.modeloDaPublicacao(u.id, id.parse(f.get("id")), nome);
  return { ok: "Modelo salvo." };
}, ["/producao/modelos"]);
export const criarDeModeloAction = guarded(async (u, f) => {
  const titulo = z.string().trim().min(2, "Informe o título").max(160).parse(f.get("titulo"));
  const novo = await P.criarDeModelo(u.id, id.parse(f.get("modeloId")), titulo);
  redirect(`/producao/${novo}`);
}, ["/producao"]);
export const excluirModeloAction = guarded(async (u, f) => { await P.excluirModelo(u.id, id.parse(f.get("id"))); return { ok: "Modelo excluído." }; }, ["/producao/modelos"]);
void modeloSchema; void revalidatePath;
