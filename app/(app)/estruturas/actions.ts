"use server";

import { guarded } from "@/lib/auth/guard";
import { idSchema, unidadeSchema, vinculoSchema } from "@/lib/validation/estruturas";
import { emailSchema } from "@/lib/validation/auth";
import { addMember, createUnit, deactivateUnit, endMembership, transferMember, updateUnit } from "@/lib/services/estruturas";
import { assignRole, revokeRole } from "@/lib/services/papeis";
import { DomainError } from "@/lib/services/errors";
import { query } from "@/lib/db";
import { z } from "zod";

const P = ["/estruturas"];

export const criarEstruturaAction = guarded(async (u, f) => {
  const d = unidadeSchema.parse(Object.fromEntries(f));
  await createUnit(u.id, d);
  return { ok: "Estrutura criada." };
}, P);

export const editarEstruturaAction = guarded(async (u, f) => {
  const d = z.object({ id: idSchema, nome: unidadeSchema.shape.nome, descricao: unidadeSchema.shape.descricao }).parse(Object.fromEntries(f));
  await updateUnit(u.id, d.id, { nome: d.nome, descricao: d.descricao });
  return { ok: "Dados atualizados." };
}, P);

export const desativarEstruturaAction = guarded(async (u, f) => {
  await deactivateUnit(u.id, idSchema.parse(f.get("id")));
  return { ok: "Estrutura desativada." };
}, P);

/** Vincula por e-mail exato: não há listagem geral de contatos. */
export const adicionarIntegranteAction = guarded(async (u, f) => {
  const unitId = idSchema.parse(f.get("unitId"));
  const email = emailSchema.parse(f.get("email"));
  const funcao = z.string().trim().max(80).optional().parse(f.get("funcao") ?? undefined) || null;
  const r = await query<import("mysql2/promise").RowDataPacket>("SELECT id FROM users WHERE email = ? AND status = 'ativo'", [email]);
  if (!r[0]) throw new DomainError("Pessoa não encontrada ou inativa.");
  await addMember(u.id, unitId, r[0].id, funcao);
  return { ok: "Integrante adicionado." };
}, P);

export const encerrarVinculoAction = guarded(async (u, f) => {
  await endMembership(u.id, idSchema.parse(f.get("membershipId")));
  return { ok: "Vínculo encerrado; o acesso foi revogado." };
}, P);

export const transferirAction = guarded(async (u, f) => {
  const d = z.object({ userId: idSchema, fromUnit: idSchema, toUnit: idSchema }).parse(Object.fromEntries(f));
  await transferMember(u.id, d.userId, d.fromUnit, d.toUnit, null);
  return { ok: "Integrante transferido." };
}, P);

export const atribuirPapelAction = guarded(async (u, f) => {
  const d = z.object({
    userId: idSchema.optional(), email: emailSchema.optional(), codigo: z.string().min(1).max(50),
    unitId: z.preprocess((v) => (v === "" || v == null ? null : v), idSchema.nullable()),
  }).parse(Object.fromEntries([...f].filter(([, v]) => v !== "")));
  let userId = d.userId;
  if (!userId) {
    const r = await query<import("mysql2/promise").RowDataPacket>("SELECT id FROM users WHERE email = ? AND status = 'ativo'", [d.email ?? ""]);
    if (!r[0]) throw new DomainError("Pessoa não encontrada ou inativa.");
    userId = r[0].id as number;
  }
  await assignRole(u.id, userId, d.codigo, d.unitId ?? null);
  return { ok: "Função atribuída." };
}, ["/estruturas", "/membros"]);

export const revogarPapelAction = guarded(async (u, f) => {
  await revokeRole(u.id, idSchema.parse(f.get("userRoleId")));
  return { ok: "Função removida." };
}, ["/estruturas", "/membros"]);
