"use server";

import { z } from "zod";
import { guarded } from "@/lib/auth/guard";
import { fonteSchema, itemLiturgiaSchema } from "@/lib/validation/liturgia";
import { adicionarFonte, excluirItem, removerFonte, salvarItem } from "@/lib/services/liturgia";
import { importarAgora, salvarProvedor, testarProvedor } from "@/lib/services/liturgia-importacao";
import { provedorSchema, TIPO_ROTULO } from "@/lib/validation/liturgia";

const P = ["/liturgia", "/"];
const id = z.coerce.number().int().positive();

export const salvarLiturgiaAction = guarded(async (u, f) => {
  await salvarItem(u.id, itemLiturgiaSchema.parse(Object.fromEntries(f)));
  return { ok: "Conteúdo salvo." };
}, P);

export const excluirLiturgiaAction = guarded(async (u, f) => {
  await excluirItem(u.id, id.parse(f.get("id")));
  return { ok: "Conteúdo removido." };
}, P);

export const adicionarFonteAction = guarded(async (u, f) => {
  await adicionarFonte(u.id, fonteSchema.parse(Object.fromEntries(f)));
  return { ok: "Fonte adicionada." };
}, ["/liturgia"]);

export const removerFonteAction = guarded(async (u, f) => {
  await removerFonte(u.id, id.parse(f.get("id")));
  return { ok: "Fonte removida." };
}, ["/liturgia"]);

/** Um formulário, dois botões: "Testar" (prévia sem gravar) e o botão padrão (salvar). */
export const provedorAction = guarded(async (u, f) => {
  const dados = provedorSchema.parse(Object.fromEntries([...f].filter(([k]) => k !== "acao")));
  if (f.get("acao") === "testar") {
    const r = await testarProvedor(u.id, dados);
    return { ok: `Prévia de hoje: ${r.itens.length} item(ns) encontrado(s). Nada foi salvo.`, detalhes: r.itens.map((i) => `${TIPO_ROTULO[i.tipo as keyof typeof TIPO_ROTULO] ?? i.tipo}: ${i.titulo}${i.texto ? `\n${i.texto.slice(0, 160)}${i.texto.length > 160 ? "…" : ""}` : ""}`) };
  }
  await salvarProvedor(u.id, dados);
  return { ok: dados.ativo ? "Configuração salva e importação ativada." : "Configuração salva (importação desativada)." };
}, ["/liturgia"]);

export const importarAgoraAction = guarded(async (u) => {
  const r = await importarAgora(u.id);
  if (!r.executado) return { ok: r.motivo ?? "Nada a importar." };
  return { ok: `Importação concluída: ${r.criados} novo(s), ${r.atualizados} atualizado(s), ${r.preservados} preservado(s).`, detalhes: r.erros };
}, ["/liturgia", "/"]);
