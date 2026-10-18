import type { RowDataPacket } from "mysql2/promise";
import { query } from "@/lib/db";
import { assertCan } from "@/lib/permissions";
import { lerConfig } from "./configuracoes";

/** Dados auxiliares dos formulários (listas de escolha) — leitura simples para quem pode ver a produção. */
export async function opcoesProducao(actor: number) {
  await assertCan(actor, "producao", "ver");
  const [campanhas, editorias, pessoas, recentes, cfg, conta] = await Promise.all([
    query<RowDataPacket & { id: number; nome: string }>("SELECT id, nome FROM campanhas WHERE status <> 'encerrada' ORDER BY nome"),
    query<RowDataPacket & { id: number; nome: string }>("SELECT id, nome FROM editorias WHERE ativa = 1 ORDER BY nome"),
    query<RowDataPacket & { id: number; nome: string }>(
      `SELECT DISTINCT u.id, u.nome FROM users u JOIN user_roles ur ON ur.user_id = u.id JOIN roles r ON r.id = ur.role_id AND r.codigo IN ('admin','coordenador','integrante')
       WHERE u.status = 'ativo' ORDER BY u.nome`),
    query<RowDataPacket & { id: number; tipo: "imagem" | "video"; nome_original: string }>(
      `SELECT m.id, m.tipo, m.nome_original FROM publicacao_redes r
         JOIN publicacao_midias pm ON pm.publicacao_id = r.publicacao_id AND pm.ordem = (SELECT MIN(ordem) FROM publicacao_midias x WHERE x.publicacao_id = r.publicacao_id)
         JOIN midias m ON m.id = pm.midia_id
       WHERE r.rede = 'instagram' AND r.envio = 'publicada' ORDER BY r.publicada_em DESC LIMIT 8`),
    lerConfig(),
    query<RowDataPacket & { nome_exibicao: string | null }>("SELECT nome_exibicao FROM redes_contas WHERE rede = 'instagram' AND status = 'conectada'"),
  ]);
  return {
    campanhas, editorias, pessoas, config: cfg,
    contaNome: (conta[0]?.nome_exibicao ?? "@novaberith").replace(/^@/, ""),
    recentes: recentes.map((m) => ({ id: m.id, tipo: m.tipo, nome: m.nome_original })),
  };
}
