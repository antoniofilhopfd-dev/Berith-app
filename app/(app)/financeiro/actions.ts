"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { guarded } from "@/lib/auth/guard";
import { idSchema, lancamentoSchema, motivoSchema, periodoSchema, valorSchema } from "@/lib/validation/financeiro";
import { aprovar, conciliar, criarCategoria, criarConta, criarLancamento, editarLancamento, estornar, fecharPeriodo, publicarPrestacao, reabrirPeriodo, rejeitar } from "@/lib/services/financeiro";

const P = ["/financeiro", "/prestacao-de-contas"];
const obj = (f: FormData) => Object.fromEntries(f);

export const criarLancamentoAction = guarded(async (u, f) => {
  const id = await criarLancamento(u.id, lancamentoSchema.parse(obj(f)));
  redirect(`/financeiro/${id}`);
}, P);
export const editarLancamentoAction = guarded(async (u, f) => {
  const o = obj(f); await editarLancamento(u.id, idSchema.parse(o.id), lancamentoSchema.parse(o));
  redirect(`/financeiro/${o.id}`);
}, P);
export const aprovarAction = guarded(async (u, f) => { await aprovar(u.id, idSchema.parse(f.get("id"))); return { ok: "Lançamento aprovado." }; }, P);
export const rejeitarAction = guarded(async (u, f) => { const d = z.object({ id: idSchema, motivo: motivoSchema }).parse(obj(f)); await rejeitar(u.id, d.id, d.motivo); return { ok: "Lançamento rejeitado." }; }, P);
export const estornarAction = guarded(async (u, f) => { const d = z.object({ id: idSchema, motivo: motivoSchema }).parse(obj(f)); const e = await estornar(u.id, d.id, d.motivo); redirect(`/financeiro/${e}`); }, P);
export const fecharPeriodoAction = guarded(async (u, f) => { await fecharPeriodo(u.id, periodoSchema.parse(f.get("periodo"))); return { ok: "Período fechado." }; }, P);
export const reabrirPeriodoAction = guarded(async (u, f) => { const d = z.object({ periodo: periodoSchema, motivo: motivoSchema }).parse(obj(f)); await reabrirPeriodo(u.id, d.periodo, d.motivo); return { ok: "Período reaberto (registrado na auditoria)." }; }, P);
export const publicarAction = guarded(async (u, f) => { const d = z.object({ periodo: periodoSchema, publicar: z.enum(["1", "0"]) }).parse(obj(f)); await publicarPrestacao(u.id, d.periodo, d.publicar === "1"); return { ok: d.publicar === "1" ? "Prestação de contas publicada para os membros." : "Prestação de contas retirada." }; }, P);
export const conciliarAction = guarded(async (u, f) => {
  const d = z.object({ contaId: idSchema, periodo: periodoSchema, saldo: z.string() }).parse(obj(f));
  const centavos = d.saldo.trim().startsWith("-") ? (() => { const v = valorSchema.safeParse(d.saldo.trim().slice(1)); return v.success ? -v.data : null; })() : (() => { const v = d.saldo.trim() === "0" || d.saldo.trim() === "0,00" ? { success: true as const, data: 0 } : valorSchema.safeParse(d.saldo); return v.success ? v.data : null; })();
  if (centavos == null) throw new z.ZodError([{ code: "custom", message: "Saldo do extrato inválido.", path: [] }]);
  const r = await conciliar(u.id, d.contaId, d.periodo, centavos, f.getAll("lancamento").map((v) => idSchema.parse(v)));
  return { ok: r.diferenca === 0 ? "Conciliado: extrato e sistema conferem." : `Registrado. Diferença entre extrato e sistema: ${(r.diferenca / 100).toFixed(2).replace(".", ",")}.` };
}, P);
export const categoriaAction = guarded(async (u, f) => { const d = z.object({ nome: z.string().trim().min(2).max(80), tipo: z.enum(["entrada", "saida"]) }).parse(obj(f)); await criarCategoria(u.id, d.nome, d.tipo); return { ok: "Categoria criada." }; }, P);
export const contaAction = guarded(async (u, f) => { await criarConta(u.id, z.string().trim().min(2).max(80).parse(f.get("nome"))); return { ok: "Conta criada." }; }, P);
