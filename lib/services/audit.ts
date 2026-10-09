import { execute } from "@/lib/db";

export async function audit(
  userId: number | null,
  acao: string,
  extra: { entidade?: string; entidadeId?: string | number; detalhes?: unknown; ip?: string | null } = {},
) {
  await execute(
    "INSERT INTO audit_log (user_id, acao, entidade, entidade_id, detalhes, ip) VALUES (?, ?, ?, ?, ?, ?)",
    [
      userId,
      acao,
      extra.entidade ?? null,
      extra.entidadeId != null ? String(extra.entidadeId) : null,
      extra.detalhes !== undefined ? JSON.stringify(extra.detalhes) : null,
      extra.ip ?? null,
    ],
  );
}
