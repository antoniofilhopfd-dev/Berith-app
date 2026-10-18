import type { RowDataPacket } from "mysql2/promise";
import { execute, query } from "@/lib/db";
import { assertCan } from "@/lib/permissions";
import { isTime } from "@/lib/time";
import { audit } from "./audit";
import { DomainError } from "./errors";

export async function getSetting(chave: string, padrao = ""): Promise<string> {
  const r = await query<RowDataPacket>("SELECT valor FROM settings WHERE chave = ?", [chave]);
  return r[0] ? String(r[0].valor) : padrao;
}
export async function setSetting(chave: string, valor: string) {
  await execute("INSERT INTO settings (chave, valor) VALUES (?, ?) ON DUPLICATE KEY UPDATE valor = VALUES(valor)", [chave, valor]);
}

export type Config = {
  nomeMinisterio: string; exigirAprovacao: boolean; impedirAutoaprovacao: boolean;
  hashtagsPadrao: string; horariosSugeridos: string[]; lembretePrazoHoras: number; fusoHorario: string;
};

export async function lerConfig(): Promise<Config> {
  const r = await query<RowDataPacket>("SELECT chave, valor FROM settings");
  const m = new Map(r.map((x) => [String(x.chave), String(x.valor)]));
  return {
    nomeMinisterio: m.get("nome_ministerio") ?? "Ministério de Comunicação",
    exigirAprovacao: (m.get("exigir_aprovacao") ?? "1") === "1",
    impedirAutoaprovacao: (m.get("impedir_autoaprovacao") ?? "0") === "1",
    hashtagsPadrao: m.get("hashtags_padrao") ?? "",
    horariosSugeridos: (m.get("horarios_sugeridos") ?? "12:00,19:00").split(",").map((x) => x.trim()).filter(isTime),
    lembretePrazoHoras: Math.min(168, Math.max(1, Number(m.get("lembrete_prazo_horas") ?? 24) || 24)),
    fusoHorario: m.get("fuso_horario") ?? "America/Sao_Paulo",
  };
}

export async function salvarConfig(actor: number, c: Omit<Config, "fusoHorario">) {
  await assertCan(actor, "configuracoes", "gerir");
  if (c.nomeMinisterio.trim().length < 2) throw new DomainError("Informe o nome do ministério.");
  if (c.horariosSugeridos.some((h) => !isTime(h))) throw new DomainError("Horários sugeridos inválidos (use HH:MM).");
  await setSetting("nome_ministerio", c.nomeMinisterio.trim().slice(0, 150));
  await setSetting("exigir_aprovacao", c.exigirAprovacao ? "1" : "0");
  await setSetting("impedir_autoaprovacao", c.impedirAutoaprovacao ? "1" : "0");
  await setSetting("hashtags_padrao", c.hashtagsPadrao.trim().slice(0, 600));
  await setSetting("horarios_sugeridos", c.horariosSugeridos.join(","));
  await setSetting("lembrete_prazo_horas", String(Math.min(168, Math.max(1, Math.round(c.lembretePrazoHoras)))));
  await audit(actor, "config.salvar", { entidade: "settings", detalhes: { exigirAprovacao: c.exigirAprovacao, impedirAutoaprovacao: c.impedirAutoaprovacao } });
}
