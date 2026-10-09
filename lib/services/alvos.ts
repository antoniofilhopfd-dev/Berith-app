import type { RowDataPacket } from "mysql2/promise";
import { query } from "@/lib/db";
import { accessibleUnitIds, type Acao, type Recurso } from "@/lib/permissions";

/** Estruturas ativas em que o usuário pode exercer (recurso, ação): usado para preencher formulários. */
export async function unitsFor(actor: number, recurso: Recurso, acao: Acao) {
  const ids = await accessibleUnitIds(actor, recurso, acao);
  if (ids !== "todas" && ids.length === 0) return [];
  return query<RowDataPacket & { id: number; nome: string; tipo: string }>(
    `SELECT id, nome, tipo FROM org_units WHERE ativo = 1 ${ids === "todas" ? "" : "AND id IN (?)"} ORDER BY tipo, nome`, ids === "todas" ? [] : [ids]);
}
