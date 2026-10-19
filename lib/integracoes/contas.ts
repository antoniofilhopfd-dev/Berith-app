import { createHash, randomBytes } from "node:crypto";
import type { RowDataPacket } from "mysql2/promise";
import { execute, query } from "@/lib/db";
import { assertCan } from "@/lib/permissions";
import { REDES_ATIVAS, REDE_ROTULO, type Rede } from "@/lib/editorial";
import { audit } from "@/lib/services/audit";
import { DomainError } from "@/lib/services/errors";
import { cifraDisponivel, cifrar, decifrar, mascarar } from "./cripto";
import { provedor } from "./index";
import type { ContaAtiva } from "./tipos";

export async function logIntegracao(rede: string | null, nivel: "info" | "aviso" | "erro", evento: string, detalhes?: string | null) {
  try { await execute("INSERT INTO integracao_logs (rede, nivel, evento, detalhes) VALUES (?,?,?,?)", [rede, nivel, evento.slice(0, 60), detalhes ? mascarar(detalhes).slice(0, 600) : null]); }
  catch (e) { console.error("[integracao-log]", e instanceof Error ? e.message : "erro"); }
}

export type StatusRede = {
  rede: Rede; appConfigurado: boolean; variaveis: string[]; escopos: string[];
  conta: { nome: string | null; status: "conectada" | "expirada" | "erro" | "desconectada"; expiraEm: Date | null; ultimoErro: string | null; conectadaEm: Date } | null;
  estado: "conectada" | "expirada" | "erro" | "nao_conectada" | "app_nao_configurado";
};

export async function statusRedes(actor: number): Promise<StatusRede[]> {
  await assertCan(actor, "integracoes", "ver");
  const contas = await query<RowDataPacket>("SELECT rede, nome_exibicao, status, expira_em, ultimo_erro, conectada_em FROM redes_contas");
  return REDES_ATIVAS.map((rede) => {
    const p = provedor(rede);
    const c = contas.find((x) => x.rede === rede);
    const conta = c && c.status !== "desconectada" ? { nome: c.nome_exibicao as string | null, status: c.status as "conectada" | "expirada" | "erro" | "desconectada", expiraEm: c.expira_em as Date | null, ultimoErro: c.ultimo_erro as string | null, conectadaEm: c.conectada_em as Date } : null;
    const estado: StatusRede["estado"] = !p.configurado() ? "app_nao_configurado" : !conta ? "nao_conectada" : conta.status === "conectada" ? "conectada" : conta.status === "expirada" ? "expirada" : "erro";
    return { rede, appConfigurado: p.configurado(), variaveis: p.variaveis(), escopos: p.escopos(), conta, estado };
  });
}

/** Nome (@usuário) da conta conectada em cada rede, para mostrar nas telas onde a publicação/dados vão ou vêm. */
export async function nomesContas(): Promise<Partial<Record<Rede, string>>> {
  const r = await query<RowDataPacket>("SELECT rede, nome_exibicao FROM redes_contas WHERE status = 'conectada' AND nome_exibicao IS NOT NULL");
  return Object.fromEntries(r.map((x) => [x.rede as Rede, String(x.nome_exibicao)]));
}

/** Redes com conta ativa (para saber se a publicação automática é possível). */
export async function redesConectadas(): Promise<Set<Rede>> {
  const r = await query<RowDataPacket>("SELECT rede FROM redes_contas WHERE status = 'conectada'");
  return new Set(r.map((x) => x.rede as Rede));
}

const sha = (s: string) => createHash("sha256").update(s).digest("hex");
export const redirectUri = (base: string, rede: Rede) => `${base.replace(/\/$/, "")}/api/integracoes/${rede}/callback`;

export async function iniciarConexao(actor: number, rede: Rede, base: string): Promise<string> {
  await assertCan(actor, "integracoes", "gerir");
  if (!REDES_ATIVAS.includes(rede)) throw new DomainError(`${REDE_ROTULO[rede]} não está habilitado neste app.`);
  const p = provedor(rede);
  if (!p.configurado()) throw new DomainError(`Credenciais do app não configuradas. Defina ${p.variaveis().join(" e ")} no ambiente.`);
  if (!cifraDisponivel()) throw new DomainError("Defina TOKEN_ENC_KEY (mínimo 32 caracteres) antes de conectar redes: os tokens são guardados cifrados.");
  const state = randomBytes(24).toString("base64url");
  await execute("DELETE FROM oauth_estados WHERE expira_em < UTC_TIMESTAMP()");
  await execute("INSERT INTO oauth_estados (state_hash, rede, user_id, expira_em) VALUES (?,?,?, DATE_ADD(UTC_TIMESTAMP(), INTERVAL 10 MINUTE))", [sha(state), rede, actor]);
  await audit(actor, "integracao.iniciar", { entidade: "rede", entidadeId: rede });
  return p.urlAutorizacao({ state, redirectUri: redirectUri(base, rede) });
}

/** Valida o state (uso único, mesmo usuário, mesma rede) e guarda os tokens cifrados. */
export async function concluirConexao(actor: number, rede: Rede, state: string, code: string, base: string): Promise<{ nome: string }> {
  await assertCan(actor, "integracoes", "gerir");
  if (!REDES_ATIVAS.includes(rede)) throw new DomainError(`${REDE_ROTULO[rede]} não está habilitado neste app.`);
  const est = (await query<RowDataPacket>("SELECT user_id, rede FROM oauth_estados WHERE state_hash = ? AND expira_em > UTC_TIMESTAMP()", [sha(state)]))[0];
  await execute("DELETE FROM oauth_estados WHERE state_hash = ?", [sha(state)]); // uso único
  if (!est || est.rede !== rede || Number(est.user_id) !== actor) throw new DomainError("Pedido de conexão inválido ou expirado. Tente conectar novamente.");
  const p = provedor(rede);
  try {
    const { tokens, perfil } = await p.trocarCodigo({ code, redirectUri: redirectUri(base, rede) });
    // Trocou para outra conta: os dados importados da conta anterior não podem se misturar com os da nova.
    const anterior = (await query<RowDataPacket>("SELECT conta_externa_id FROM redes_contas WHERE rede = ?", [rede]))[0]?.conta_externa_id as string | null | undefined;
    if (anterior && anterior !== perfil.contaExternaId) {
      await execute("DELETE FROM posts_externos WHERE rede = ?", [rede]);
      await execute("DELETE FROM metricas_conta WHERE rede = ?", [rede]);
      await logIntegracao(rede, "aviso", "conta_trocada", "A conta conectada mudou: posts e métricas importados da conta anterior foram removidos.");
    }
    await execute(
      `INSERT INTO redes_contas (rede, nome_exibicao, conta_externa_id, status, escopos, token_enc, refresh_enc, expira_em, meta, ultimo_erro, conectada_por, conectada_em)
       VALUES (?,?,?, 'conectada', ?,?,?,?,?, NULL, ?, UTC_TIMESTAMP())
       ON DUPLICATE KEY UPDATE nome_exibicao = VALUES(nome_exibicao), conta_externa_id = VALUES(conta_externa_id), status = 'conectada', escopos = VALUES(escopos),
         token_enc = VALUES(token_enc), refresh_enc = VALUES(refresh_enc), expira_em = VALUES(expira_em), meta = VALUES(meta), ultimo_erro = NULL, conectada_por = VALUES(conectada_por), conectada_em = UTC_TIMESTAMP()`,
      [rede, perfil.nome, perfil.contaExternaId, tokens.escopos ?? p.escopos().join(","), cifrar(tokens.accessToken), tokens.refreshToken ? cifrar(tokens.refreshToken) : null, tokens.expiraEm ?? null, JSON.stringify(perfil.meta ?? {}), actor]);
    await audit(actor, "integracao.conectar", { entidade: "rede", entidadeId: rede, detalhes: { conta: perfil.nome } });
    await logIntegracao(rede, "info", "conectada", `Conta ${perfil.nome} conectada.`);
    return { nome: perfil.nome };
  } catch (e) {
    const msg = mascarar(e instanceof Error ? e.message : "erro");
    await logIntegracao(rede, "erro", "conexao_falhou", msg);
    throw new DomainError(`Não foi possível conectar: ${msg}`);
  }
}

export async function desconectar(actor: number, rede: Rede) {
  await assertCan(actor, "integracoes", "gerir");
  await execute("UPDATE redes_contas SET status = 'desconectada', token_enc = '', refresh_enc = NULL, expira_em = NULL WHERE rede = ?", [rede]);
  await audit(actor, "integracao.desconectar", { entidade: "rede", entidadeId: rede });
  await logIntegracao(rede, "info", "desconectada", null);
}

/** Conta pronta para uso: renova o token se necessário; marca como expirada se não for possível. */
export async function contaAtiva(rede: Rede, agora = new Date()): Promise<{ conta: ContaAtiva } | { erro: string; reconectar: boolean }> {
  const r = (await query<RowDataPacket>("SELECT * FROM redes_contas WHERE rede = ?", [rede]))[0];
  if (!r || r.status === "desconectada" || !r.token_enc) return { erro: "Rede não conectada.", reconectar: true };
  if (r.status !== "conectada") return { erro: "Acesso à rede expirado ou com erro. Reconecte a conta.", reconectar: true };
  try {
    let token = decifrar(r.token_enc as string);
    let meta: Record<string, string> = {};
    try { meta = JSON.parse((r.meta as string) || "{}"); } catch { /* sem meta */ }
    const expira = r.expira_em ? new Date(r.expira_em as Date) : null;
    if (expira && expira.getTime() - agora.getTime() < 10 * 60_000) {
      try {
        const t = await provedor(rede).renovar({ refreshToken: r.refresh_enc ? decifrar(r.refresh_enc as string) : null, token, meta });
        token = t.accessToken;
        await execute("UPDATE redes_contas SET token_enc = ?, refresh_enc = COALESCE(?, refresh_enc), expira_em = ? WHERE rede = ?",
          [cifrar(t.accessToken), t.refreshToken ? cifrar(t.refreshToken) : null, t.expiraEm ?? null, rede]);
        await logIntegracao(rede, "info", "token_renovado", null);
      } catch (e) {
        const msg = mascarar(e instanceof Error ? e.message : "erro");
        await execute("UPDATE redes_contas SET status = 'expirada', ultimo_erro = ? WHERE rede = ?", [msg.slice(0, 300), rede]);
        await logIntegracao(rede, "erro", "renovacao_falhou", msg);
        return { erro: "Não foi possível renovar o acesso à rede. Reconecte a conta.", reconectar: true };
      }
    }
    return { conta: { rede, contaExternaId: (r.conta_externa_id as string) ?? null, nome: (r.nome_exibicao as string) ?? null, token, meta } };
  } catch (e) {
    const msg = mascarar(e instanceof Error ? e.message : "erro");
    await logIntegracao(rede, "erro", "token_ilegivel", msg);
    return { erro: "Não foi possível ler o acesso salvo (verifique TOKEN_ENC_KEY). Reconecte a conta.", reconectar: true };
  }
}

export async function marcarContaComErro(rede: Rede, erro: string) {
  await execute("UPDATE redes_contas SET status = 'expirada', ultimo_erro = ? WHERE rede = ? AND status = 'conectada'", [mascarar(erro).slice(0, 300), rede]);
}

export async function logs(actor: number, limite = 100) {
  await assertCan(actor, "integracoes", "ver");
  return query<RowDataPacket & { id: number; rede: string | null; nivel: "info" | "aviso" | "erro"; evento: string; detalhes: string | null; criado_em: Date }>(
    "SELECT id, rede, nivel, evento, detalhes, criado_em FROM integracao_logs ORDER BY id DESC LIMIT ?", [limite]);
}
