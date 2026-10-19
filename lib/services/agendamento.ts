import type { PoolConnection, RowDataPacket } from "mysql2/promise";
import { comTrava, execute, query, tx } from "@/lib/db";
import { assertCan, ForbiddenError } from "@/lib/permissions";
import { REDES_ATIVAS, REDE_ROTULO, problemasDoConteudo, textoDaRede, type Formato, type Rede, type Status } from "@/lib/editorial";
import { audit } from "./audit";
import { DomainError, NotFoundError } from "./errors";
import { destinatariosCom, notificar, notificarSeguro } from "./notificacoes";
import { lerConfig } from "./configuracoes";
import { conteudoParaValidar, getPub, podeEditar, type Pub, type PubRede } from "./publicacoes";
import { addDays, localToUtc, utcToLocal } from "@/lib/time";
import { contaAtiva, contasInstagramAtivas, logIntegracao, marcarContaComErro } from "@/lib/integracoes/contas";
import { provedor } from "@/lib/integracoes";
import { mascarar } from "@/lib/integracoes/cripto";
import { urlPublicaTemporaria } from "./midia";
import { caminhoDoArquivo } from "@/lib/storage/disco";
import type { MidiaPublicavel } from "@/lib/integracoes/tipos";

export const MAX_TENTATIVAS = 3;
const ANTECEDENCIA_MIN_MS = 60_000;

async function historico(c: Pick<PoolConnection, "query">, pubId: number, actor: number | null, acao: string, o: { de?: string | null; para?: string | null; detalhes?: string | null } = {}) {
  await c.query("INSERT INTO publicacao_historico (publicacao_id, user_id, acao, de_status, para_status, detalhes) VALUES (?,?,?,?,?,?)", [pubId, actor, acao, o.de ?? null, o.para ?? null, o.detalhes?.slice(0, 600) ?? null]);
}

/* ================= Agendamento ================= */
export async function agendar(actor: number, id: number, quando: Date, agora = new Date()) {
  await assertCan(actor, "publicacao", "criar");
  const cfg = await lerConfig();
  if (quando.getTime() < agora.getTime() + ANTECEDENCIA_MIN_MS) throw new DomainError("Escolha um horário futuro (ao menos 1 minuto à frente).");
  const titulo = await tx(async (c) => {
    const [rows] = await c.query<(Pub & RowDataPacket)[]>("SELECT * FROM publicacoes WHERE id = ? FOR UPDATE", [id]);
    const p = rows[0]; if (!p) throw new NotFoundError();
    const ok: Status[] = cfg.exigirAprovacao ? ["aprovado", "agendado"] : ["em_producao", "em_revisao", "ajustes_solicitados", "aprovado", "agendado"];
    if (!ok.includes(p.status)) throw new DomainError(cfg.exigirAprovacao ? "Só conteúdo aprovado pode ser agendado (regra do ministério)." : "Este conteúdo ainda não está pronto para agendar.");
    const prob = problemasDoConteudo(await conteudoParaValidar(id, c));
    if (prob.length) throw new DomainError(`Conteúdo incompleto: ${prob.join(" ")}`);
    await c.query("UPDATE publicacoes SET status = 'agendado', publicar_em = ?, rev = rev + 1 WHERE id = ?", [quando, id]);
    await c.query("UPDATE publicacao_redes SET envio = 'agendada', agendada_para = ?, tentativas = 0, proxima_tentativa = NULL, ultimo_erro = NULL WHERE publicacao_id = ? AND envio IN ('pendente','agendada','falhou','cancelada')", [quando, id]);
    await historico(c, id, actor, p.status === "agendado" ? "reagendar" : "agendar", { de: p.status, para: "agendado", detalhes: `Para ${utcToLocal(quando).date} ${utcToLocal(quando).time}` });
    return p.titulo as string;
  });
  await audit(actor, "publicacao.agendar", { entidade: "publicacao", entidadeId: id, detalhes: { quando } });
  return titulo;
}

/** Cancela o agendamento (volta a "aprovado"); redes já publicadas não são afetadas. */
export async function desagendar(actor: number, id: number) {
  await assertCan(actor, "publicacao", "editar");
  await tx(async (c) => {
    const [rows] = await c.query<(Pub & RowDataPacket)[]>("SELECT * FROM publicacoes WHERE id = ? FOR UPDATE", [id]);
    const p = rows[0]; if (!p) throw new NotFoundError();
    if (p.status !== "agendado") throw new DomainError("Esta publicação não está agendada.");
    const em = await c.query("SELECT 1 FROM publicacao_redes WHERE publicacao_id = ? AND envio = 'publicando' LIMIT 1", [id]);
    if ((em[0] as unknown[]).length) throw new DomainError("A publicação está sendo enviada agora. Aguarde o resultado.");
    await c.query("UPDATE publicacoes SET status = 'aprovado', rev = rev + 1 WHERE id = ?", [id]);
    await c.query("UPDATE publicacao_redes SET envio = 'pendente', agendada_para = NULL, proxima_tentativa = NULL WHERE publicacao_id = ? AND envio IN ('agendada','falhou')", [id]);
    await historico(c, id, actor, "desagendar", { de: "agendado", para: "aprovado" });
  });
  await audit(actor, "publicacao.desagendar", { entidade: "publicacao", entidadeId: id });
}

/**
 * Reagendamento (calendário). Publicação agendada: muda o horário da fila. Demais status: apenas a data planejada
 * (permanece como está; ninguém é publicado por isso). Publicadas/canceladas não se movem.
 */
export async function reagendar(actor: number, id: number, quando: Date, agora = new Date()) {
  const { pub } = await getPub(actor, id);
  if (pub.status === "publicado" || pub.status === "cancelado") throw new DomainError("Publicações já publicadas ou canceladas não podem ser movidas.");
  if (pub.status === "agendado") {
    await assertCan(actor, "publicacao", "editar");
    if (quando.getTime() < agora.getTime() + ANTECEDENCIA_MIN_MS) throw new DomainError("Escolha um horário futuro (ao menos 1 minuto à frente).");
    await tx(async (c) => {
      const [busy] = await c.query<RowDataPacket[]>("SELECT 1 FROM publicacao_redes WHERE publicacao_id = ? AND envio = 'publicando' LIMIT 1", [id]);
      if (busy.length) throw new DomainError("A publicação está sendo enviada agora. Aguarde o resultado.");
      await c.query("UPDATE publicacoes SET publicar_em = ?, rev = rev + 1 WHERE id = ?", [quando, id]);
      await c.query("UPDATE publicacao_redes SET agendada_para = ?, tentativas = 0, proxima_tentativa = NULL, ultimo_erro = NULL, envio = 'agendada' WHERE publicacao_id = ? AND envio IN ('agendada','falhou')", [quando, id]);
      await historico(c, id, actor, "reagendar", { detalhes: `Para ${utcToLocal(quando).date} ${utcToLocal(quando).time}` });
    });
  } else {
    if (!(await podeEditar(actor, pub))) throw new ForbiddenError();
    await execute("UPDATE publicacoes SET publicar_em = ?, rev = rev + 1 WHERE id = ?", [quando, id]);
    await tx((c) => historico(c, id, actor, "data_planejada", { detalhes: `Para ${utcToLocal(quando).date} ${utcToLocal(quando).time}` }));
  }
  await audit(actor, "publicacao.reagendar", { entidade: "publicacao", entidadeId: id, detalhes: { quando } });
}

/** Move para outro dia mantendo o horário (arrastar e soltar). Sem horário definido, usa o primeiro horário sugerido. */
export async function moverParaDia(actor: number, id: number, dia: string, agora = new Date()) {
  const { pub } = await getPub(actor, id);
  const cfg = await lerConfig();
  const hora = pub.publicar_em ? utcToLocal(new Date(pub.publicar_em)).time : cfg.horariosSugeridos[0] ?? "09:00";
  await reagendar(actor, id, localToUtc(dia, hora), agora);
}

export async function cancelarRede(actor: number, redeId: number) {
  await assertCan(actor, "publicacao", "editar");
  const r = (await query<(PubRede & RowDataPacket)>("SELECT * FROM publicacao_redes WHERE id = ?", [redeId]))[0];
  if (!r) throw new NotFoundError();
  if (r.envio === "publicando" || r.envio === "publicada") throw new DomainError("Não é possível cancelar: já enviada ou em envio.");
  await execute("UPDATE publicacao_redes SET envio = 'cancelada', agendada_para = NULL, proxima_tentativa = NULL WHERE id = ?", [redeId]);
  await tx((c) => historico(c, r.publicacao_id, actor, "cancelar_rede", { detalhes: r.rede }));
  await atualizarStatusGeral(r.publicacao_id);
  await audit(actor, "publicacao.cancelar_rede", { entidade: "publicacao_rede", entidadeId: redeId });
}

/** Reprocessamento seguro: só uma rede em "falhou", uma vez por clique, sem duplicar o que já foi publicado. */
export async function reprocessar(actor: number, redeId: number, agora = new Date()) {
  await assertCan(actor, "publicacao", "editar");
  const r = await execute("UPDATE publicacao_redes SET envio = 'agendada', agendada_para = ?, tentativas = 0, proxima_tentativa = NULL, ultimo_erro = NULL WHERE id = ? AND envio = 'falhou'", [agora, redeId]);
  if (r.affectedRows !== 1) throw new DomainError("Só é possível reprocessar uma rede que falhou.");
  const x = (await query<RowDataPacket>("SELECT publicacao_id, rede FROM publicacao_redes WHERE id = ?", [redeId]))[0];
  await execute("UPDATE publicacoes SET status = 'agendado' WHERE id = ? AND status IN ('aprovado','agendado')", [x.publicacao_id]);
  await tx((c) => historico(c, Number(x.publicacao_id), actor, "reprocessar", { detalhes: String(x.rede) }));
  await audit(actor, "publicacao.reprocessar", { entidade: "publicacao_rede", entidadeId: redeId });
}

/* ================= Publicação assistida ================= */
export const URL_COMPOSICAO: Record<Rede, string> = {
  instagram: "https://www.instagram.com/", facebook: "https://business.facebook.com/latest/composer", tiktok: "https://www.tiktok.com/creator-center/upload", youtube: "https://studio.youtube.com/",
};

export async function preparoAssistido(actor: number, redeId: number) {
  await assertCan(actor, "publicacao", "ver");
  const r = (await query<(PubRede & RowDataPacket)>("SELECT * FROM publicacao_redes WHERE id = ?", [redeId]))[0];
  if (!r) throw new NotFoundError();
  const { pub, midias } = await getPub(actor, r.publicacao_id);
  const texto = textoDaRede({ legenda: pub.legenda, hashtags: pub.hashtags }, { legenda: r.legenda, hashtags: r.hashtags });
  return { rede: r.rede, publicacaoId: pub.id, titulo: r.titulo_externo || pub.titulo, formato: pub.formato, texto, midias, abrir: URL_COMPOSICAO[r.rede], envio: r.envio, status: pub.status };
}

/** A pessoa publicou manualmente na rede e confirma aqui. Fica registrado como "assistida" (nunca como automática). */
export async function marcarPublicadaManual(actor: number, redeId: number, o: { url?: string | null } = {}, agora = new Date()) {
  await assertCan(actor, "publicacao", "criar");
  const url = o.url?.trim() || null;
  if (url && !/^https:\/\/[^\s]{3,480}$/.test(url)) throw new DomainError("O link da publicação deve começar com https://.");
  const r = (await query<(PubRede & RowDataPacket)>("SELECT * FROM publicacao_redes WHERE id = ?", [redeId]))[0];
  if (!r) throw new NotFoundError();
  if (r.envio === "publicada") throw new DomainError("Esta rede já consta como publicada.");
  if (r.envio === "publicando") throw new DomainError("A publicação está em envio automático. Aguarde o resultado.");
  const p = (await query<RowDataPacket>("SELECT status FROM publicacoes WHERE id = ?", [r.publicacao_id]))[0];
  if (!["aprovado", "agendado"].includes(p.status)) throw new DomainError("Só conteúdo aprovado ou agendado pode ser marcado como publicado.");
  const u = await execute("UPDATE publicacao_redes SET envio = 'publicada', assistida = 1, publicada_em = ?, url_externa = ?, ultimo_erro = NULL WHERE id = ? AND envio <> 'publicada' AND envio <> 'publicando'", [agora, url, redeId]);
  if (u.affectedRows !== 1) throw new DomainError("A situação mudou; recarregue a página.");
  await tx((c) => historico(c, r.publicacao_id, actor, "publicada_assistida", { detalhes: `${r.rede}${url ? ` · ${url}` : ""}` }));
  await atualizarStatusGeral(r.publicacao_id);
  await audit(actor, "publicacao.assistida", { entidade: "publicacao_rede", entidadeId: redeId });
}

/** Quando todas as redes ativas foram publicadas, a publicação passa a "publicado". */
export async function atualizarStatusGeral(pubId: number) {
  const redes = await query<RowDataPacket>("SELECT envio FROM publicacao_redes WHERE publicacao_id = ?", [pubId]);
  const ativas = redes.filter((r) => r.envio !== "cancelada");
  const p = (await query<RowDataPacket>("SELECT status FROM publicacoes WHERE id = ?", [pubId]))[0];
  if (!p) return;
  if (ativas.length > 0 && ativas.every((r) => r.envio === "publicada") && p.status !== "publicado") {
    await execute("UPDATE publicacoes SET status = 'publicado', rev = rev + 1 WHERE id = ? AND status IN ('agendado','aprovado')", [pubId]);
    await execute("INSERT INTO publicacao_historico (publicacao_id, user_id, acao, de_status, para_status) VALUES (?, NULL, 'publicado', ?, 'publicado')", [pubId, p.status]);
  } else if (ativas.length === 0 && p.status === "agendado") {
    await execute("UPDATE publicacoes SET status = 'aprovado' WHERE id = ?", [pubId]);
  }
}

/* ================= Fila ================= */
export type ItemFila = PubRede & {
  titulo: string; formato: Formato; pub_status: Status; publicar_em: Date | null; responsavel_nome: string | null;
};
export async function fila(actor: number, f: { envio?: string[]; limite?: number } = {}): Promise<ItemFila[]> {
  await assertCan(actor, "publicacao", "ver");
  const w = f.envio?.length ? "AND r.envio IN (?)" : "";
  return query<ItemFila & RowDataPacket>(
    `SELECT r.*, p.titulo, p.formato, p.status AS pub_status, p.publicar_em, u.nome AS responsavel_nome
     FROM publicacao_redes r JOIN publicacoes p ON p.id = r.publicacao_id LEFT JOIN users u ON u.id = p.responsavel_id
     WHERE p.status IN ('aprovado','agendado','publicado') ${w} ORDER BY COALESCE(r.agendada_para, p.publicar_em, r.publicada_em) DESC, r.id DESC LIMIT ?`,
    [...(f.envio?.length ? [f.envio] : []), f.limite ?? 200]);
}

export async function tentativas(actor: number, redeId: number) {
  await assertCan(actor, "publicacao", "ver");
  return query<RowDataPacket & { id: number; iniciada_em: Date; finalizada_em: Date | null; resultado: "sucesso" | "falha" | "em_andamento"; http_status: number | null; erro: string | null }>(
    "SELECT id, iniciada_em, finalizada_em, resultado, http_status, erro FROM publicacao_tentativas WHERE publicacao_rede_id = ? ORDER BY id DESC LIMIT 20", [redeId]);
}

/* ================= Processamento da fila (cron) ================= */
export type ResultadoFila = { processadas: number; publicadas: number; falhas: number; reagendadas: number; recuperadas: number; ocupado?: boolean };
const LOCK = "berith_fila_publicacao";
const backoffMin = (tentativa: number) => 5 * 2 ** (tentativa - 1); // 5, 10, 20 min

async function montarConteudo(redeRow: PubRede & RowDataPacket, base: string): Promise<{ pub: Pub; conteudo: import("@/lib/integracoes/tipos").ConteudoPublicar }> {
  const p = (await query<Pub & RowDataPacket>("SELECT * FROM publicacoes WHERE id = ?", [redeRow.publicacao_id]))[0];
  const ms = await query<RowDataPacket>(
    `SELECT m.id, m.tipo, m.mime, m.nome_original, m.largura, m.altura, m.tamanho, m.arquivo FROM publicacao_midias pm JOIN midias m ON m.id = pm.midia_id
     WHERE pm.publicacao_id = ? AND m.removido_em IS NULL ORDER BY pm.ordem, m.id`, [redeRow.publicacao_id]);
  const midias: MidiaPublicavel[] = ms.map((m) => ({
    id: Number(m.id), tipo: m.tipo, mime: m.mime, nome: m.nome_original, largura: m.largura, altura: m.altura, tamanho: Number(m.tamanho),
    url: urlPublicaTemporaria(base, Number(m.id), 3600), caminhoArquivo: caminhoDoArquivo(m.arquivo as string),
  }));
  return {
    pub: p,
    conteudo: {
      publicacaoId: p.id, redeId: redeRow.id, rede: redeRow.rede, formato: p.formato, titulo: redeRow.titulo_externo || p.titulo,
      texto: textoDaRede({ legenda: p.legenda, hashtags: p.hashtags }, { legenda: redeRow.legenda, hashtags: redeRow.hashtags }), midias,
    },
  };
}

/**
 * Publica o que venceu na fila. Exclusão mútua (GET_LOCK) + reivindicação atômica por linha impedem publicar duas vezes.
 * Falhas transitórias têm até 3 tentativas com espera crescente; falhas definitivas e resultados incertos exigem ação humana.
 */
export async function processarFila(base: string, agora = new Date(), limite = 20): Promise<ResultadoFila> {
  const vazio: ResultadoFila = { processadas: 0, publicadas: 0, falhas: 0, reagendadas: 0, recuperadas: 0 };
  const r = await comTrava(LOCK, () => executarFila(base, agora, limite));
  return r.ocupado ? { ...vazio, ocupado: true } : r.valor;
}

async function executarFila(base: string, agora: Date, limite: number): Promise<ResultadoFila> {
  const res: ResultadoFila = { processadas: 0, publicadas: 0, falhas: 0, reagendadas: 0, recuperadas: 0 };
  {
    // Envios que ficaram "publicando" por muito tempo têm resultado incerto: nunca repetimos sozinhos (evita post duplicado).
    const presas = await query<RowDataPacket>(
      `SELECT r.id, r.publicacao_id FROM publicacao_redes r WHERE r.envio = 'publicando' AND NOT EXISTS (SELECT 1 FROM publicacao_tentativas t WHERE t.publicacao_rede_id = r.id AND t.resultado = 'em_andamento' AND t.iniciada_em > ?)`,
      [new Date(agora.getTime() - 30 * 60_000)]);
    for (const x of presas) {
      await execute("UPDATE publicacao_redes SET envio = 'falhou', ultimo_erro = 'Resultado desconhecido (processo interrompido). Confira na rede social antes de reprocessar, para não duplicar.' WHERE id = ? AND envio = 'publicando'", [x.id]);
      await execute("UPDATE publicacao_tentativas SET resultado = 'falha', finalizada_em = ?, erro = 'Interrompida' WHERE publicacao_rede_id = ? AND resultado = 'em_andamento'", [agora, x.id]);
      res.recuperadas++;
      await avisarFalha(Number(x.publicacao_id), "Resultado incerto de uma publicação; confira antes de reprocessar.");
    }

    const vencidas = await query<PubRede & RowDataPacket>(
      `SELECT r.* FROM publicacao_redes r JOIN publicacoes p ON p.id = r.publicacao_id
       WHERE r.envio = 'agendada' AND r.agendada_para <= ? AND (r.proxima_tentativa IS NULL OR r.proxima_tentativa <= ?) AND p.status = 'agendado'
       ORDER BY r.agendada_para, r.id LIMIT ?`, [agora, agora, limite]);
    for (const r of vencidas) {
      const claim = await execute("UPDATE publicacao_redes SET envio = 'publicando', tentativas = tentativas + 1 WHERE id = ? AND envio = 'agendada'", [r.id]);
      if (claim.affectedRows !== 1) continue;
      res.processadas++;
      const tent = (await execute("INSERT INTO publicacao_tentativas (publicacao_rede_id, iniciada_em) VALUES (?, ?)", [r.id, agora])).insertId;
      const n = r.tentativas + 1;
      const finalizar = async (resultado: "sucesso" | "falha", http: number | null, erro: string | null) =>
        execute("UPDATE publicacao_tentativas SET resultado = ?, finalizada_em = UTC_TIMESTAMP(), http_status = ?, erro = ? WHERE id = ?", [resultado, http, erro?.slice(0, 500) ?? null, tent]);
      try {
        const { conteudo } = await montarConteudo(r, base);
        const prob = problemasDoConteudo(await conteudoParaValidar(r.publicacao_id));
        if (prob.length) throw Object.assign(new Error(`Conteúdo inválido: ${prob.join(" ")}`), { definitivo: true });
        const ca = await contaAtiva(r.rede, agora);
        if ("erro" in ca) throw Object.assign(new Error(`${ca.erro} Use a publicação assistida ou conecte a conta em Configurações → Redes sociais.`), { definitivo: true });
        const out = await provedor(r.rede).publicar(ca.conta, conteudo);
        if (out.ok) {
          await execute("UPDATE publicacao_redes SET envio = 'publicada', publicada_em = ?, post_externo_id = ?, url_externa = ?, ultimo_erro = NULL, assistida = 0 WHERE id = ?", [agora, out.idExterno.slice(0, 190), out.url?.slice(0, 500) ?? null, r.id]);
          await finalizar("sucesso", 200, null);
          await execute("INSERT INTO publicacao_historico (publicacao_id, user_id, acao, detalhes) VALUES (?, NULL, 'publicada_automatica', ?)", [r.publicacao_id, `${r.rede} · ${out.idExterno}`]);
          await logIntegracao(r.rede, "info", "publicada", `Publicação #${r.publicacao_id} → ${out.idExterno}`);
          await atualizarStatusGeral(r.publicacao_id);
          res.publicadas++;
        } else {
          if (out.reconectar) await marcarContaComErro(r.rede, out.erro);
          throw Object.assign(new Error(out.erro), { definitivo: out.definitivo, http: out.httpStatus });
        }
      } catch (e) {
        const err = e as Error & { definitivo?: boolean; http?: number };
        const msg = mascarar(err.message || "erro").slice(0, 480);
        await finalizar("falha", err.http ?? null, msg);
        await logIntegracao(r.rede, "erro", "publicacao_falhou", `Publicação #${r.publicacao_id}: ${msg}`);
        if (err.definitivo || n >= MAX_TENTATIVAS) {
          await execute("UPDATE publicacao_redes SET envio = 'falhou', ultimo_erro = ?, proxima_tentativa = NULL WHERE id = ?", [msg, r.id]);
          res.falhas++;
          await execute("INSERT INTO publicacao_historico (publicacao_id, user_id, acao, detalhes) VALUES (?, NULL, 'falha_publicacao', ?)", [r.publicacao_id, `${r.rede}: ${msg}`.slice(0, 600)]);
          await avisarFalha(r.publicacao_id, `${r.rede}: ${msg}`);
        } else {
          await execute("UPDATE publicacao_redes SET envio = 'agendada', ultimo_erro = ?, proxima_tentativa = ? WHERE id = ?", [msg, new Date(agora.getTime() + backoffMin(n) * 60_000), r.id]);
          res.reagendadas++;
        }
      }
    }
    return res;
  }
}


async function avisarFalha(pubId: number, detalhe: string) {
  const p = (await query<RowDataPacket>("SELECT titulo, responsavel_id FROM publicacoes WHERE id = ?", [pubId]))[0];
  if (!p) return;
  await notificarSeguro(async () => {
    const quem = [...(await destinatariosCom("publicacao", "editar")), ...(p.responsavel_id ? [Number(p.responsavel_id)] : [])];
    await notificar(quem, { tipo: "falha", titulo: `Falha ao publicar: ${p.titulo}`, corpo: detalhe.slice(0, 280), url: `/publicacoes`, dedupeKey: `falha:${pubId}:${Math.floor(Date.now() / 3_600_000)}` });
  });
}

/* ================= Coleta de métricas (cron) ================= */
export async function coletarMetricas(agora = new Date()): Promise<{ publicacoes: number; contas: number; postsConta: number }> {
  const out = { publicacoes: 0, contas: 0, postsConta: 0 };
  const redes = await query<RowDataPacket>(
    `SELECT r.id, r.rede, r.post_externo_id, p.formato FROM publicacao_redes r JOIN publicacoes p ON p.id = r.publicacao_id
     WHERE r.envio = 'publicada' AND r.assistida = 0 AND r.post_externo_id IS NOT NULL AND r.publicada_em > DATE_SUB(?, INTERVAL 90 DAY)
       AND NOT EXISTS (SELECT 1 FROM metricas_publicacao m WHERE m.publicacao_rede_id = r.id AND m.coletado_em > DATE_SUB(?, INTERVAL 6 HOUR)) LIMIT 100`, [agora, agora]);
  const contas = new Map<Rede, Awaited<ReturnType<typeof contaAtiva>>>();
  for (const r of redes) {
    const rede = r.rede as Rede;
    if (!contas.has(rede)) contas.set(rede, await contaAtiva(rede, agora));
    const ca = contas.get(rede)!;
    if ("erro" in ca) continue;
    try {
      const m = await provedor(rede).metricasPublicacao(ca.conta, r.post_externo_id as string, r.formato as Formato);
      if (m) {
        await execute("INSERT INTO metricas_publicacao (publicacao_rede_id, coletado_em, alcance, impressoes, curtidas, comentarios, compartilhamentos, salvamentos, visualizacoes) VALUES (?,?,?,?,?,?,?,?,?)",
          [r.id, agora, m.alcance ?? null, m.impressoes ?? null, m.curtidas ?? null, m.comentarios ?? null, m.compartilhamentos ?? null, m.salvamentos ?? null, m.visualizacoes ?? null]);
        out.publicacoes++;
      }
    } catch (e) { await logIntegracao(rede, "aviso", "metricas_falhou", e instanceof Error ? e.message : "erro"); }
  }
  for (const rede of REDES_ATIVAS) {
    for (const c of await contasDaRede(rede, agora)) {
      const r = await sincronizarUmaConta(rede, c.conta, agora, { meses: rede === "instagram" ? 2 : 0 });
      out.contas += r.contas; out.postsConta += r.posts;
    }
  }
  return out;
}

/** Importa os posts recentes da conta inteira (inclusive os feitos fora do app). No máximo a cada 6 h por rede. */
const JANELA_POSTS_DIAS = 400, LIMITE_POSTS = 200;
type ContaDaRede = Parameters<ReturnType<typeof provedor>["metricasConta"]>[0];
async function importarPostsDaConta(rede: Rede, conta: ContaDaRede, agora: Date, forcar = false): Promise<{ n: number; erro?: string }> {
  const prov = provedor(rede);
  if (!prov.listarPostsConta) return { n: 0 };
  if (!forcar) {
    const recente = await query<RowDataPacket>("SELECT 1 FROM posts_externos WHERE rede = ? AND conta_id = ? AND coletado_em > DATE_SUB(?, INTERVAL 6 HOUR) LIMIT 1", [rede, conta.contaExternaId ?? "", agora]);
    if (recente.length) return { n: 0 };
  }
  try {
    const desde = new Date(agora.getTime() - JANELA_POSTS_DIAS * 86_400_000);
    const posts = await prov.listarPostsConta(conta, desde, LIMITE_POSTS);
    for (const p of posts) {
      await execute(
        `INSERT INTO posts_externos (rede, conta_id, id_externo, tipo, legenda, url, miniatura, publicado_em, alcance, curtidas, comentarios, compartilhamentos, salvamentos, visualizacoes, coletado_em)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
         ON DUPLICATE KEY UPDATE conta_id = VALUES(conta_id), tipo = VALUES(tipo), legenda = VALUES(legenda), url = VALUES(url), miniatura = VALUES(miniatura), alcance = COALESCE(VALUES(alcance), alcance), curtidas = VALUES(curtidas), comentarios = VALUES(comentarios),
           compartilhamentos = COALESCE(VALUES(compartilhamentos), compartilhamentos), salvamentos = COALESCE(VALUES(salvamentos), salvamentos), visualizacoes = COALESCE(VALUES(visualizacoes), visualizacoes), coletado_em = VALUES(coletado_em)`,
        [rede, conta.contaExternaId ?? "", p.idExterno, p.tipo, p.legenda?.slice(0, 2000) ?? null, p.url, p.miniatura ?? null, p.publicadoEm, p.alcance ?? null, p.curtidas ?? null, p.comentarios ?? null, p.compartilhamentos ?? null, p.salvamentos ?? null, p.visualizacoes ?? null, agora]);
    }
    if (posts.length) await logIntegracao(rede, "info", "posts_importados", `${posts.length} post(s) da conta atualizados`);
    return { n: posts.length };
  } catch (e) {
    const msg = mascarar(e instanceof Error ? e.message : "erro");
    await logIntegracao(rede, "aviso", "posts_conta_falhou", msg);
    return { n: 0, erro: msg };
  }
}

/** Contas de uma rede prontas para leitura. Instagram: a principal + as extras das demais Páginas. */
async function contasDaRede(rede: Rede, agora: Date): Promise<{ conta: ContaDaRede; rotulo: string }[]> {
  if (rede === "instagram") return (await contasInstagramAtivas(agora)).map((c) => ({ conta: c.conta, rotulo: c.usuario }));
  const ca = await contaAtiva(rede, agora);
  return "conta" in ca ? [{ conta: ca.conta, rotulo: REDE_ROTULO[rede] }] : [];
}

/** Uma rodada de leitura de UMA conta: seguidores do dia, métricas mensais (Instagram) e posts. Nunca lança; devolve os erros. */
async function sincronizarUmaConta(rede: Rede, conta: ContaDaRede, agora: Date, o: { meses: number; forcar?: boolean }): Promise<{ contas: number; posts: number; meses: number; erro?: string }> {
  const out = { contas: 0, posts: 0, meses: 0, erro: undefined as string | undefined };
  const contaId = conta.contaExternaId ?? "";
  try {
    const m = await provedor(rede).metricasConta(conta);
    if (m) {
      await execute("INSERT INTO metricas_conta (rede, conta_id, dia, seguidores, alcance, visualizacoes) VALUES (?,?,?,?,?,?) ON DUPLICATE KEY UPDATE seguidores = VALUES(seguidores), alcance = VALUES(alcance), visualizacoes = VALUES(visualizacoes)",
        [rede, contaId, utcToLocal(agora).date, m.seguidores ?? null, m.alcance ?? null, m.visualizacoes ?? null]);
      out.contas++;
    }
  } catch (e) { await logIntegracao(rede, "aviso", "metricas_conta_falhou", e instanceof Error ? e.message : "erro"); }
  if (rede === "instagram" && o.meses > 0) {
    const mm = await atualizarMesesInstagram(conta, o.meses, agora);
    out.meses = mm.meses; out.erro = mm.erro;
    const jj = await atualizarJanelasInstagram(conta, agora);
    if (jj.janelas === 0 && !out.erro) out.erro = jj.erro;
  }
  const r = await importarPostsDaConta(rede, conta, agora, o.forcar);
  out.posts = r.n; out.erro = r.erro ?? out.erro;
  return out;
}

/** Totais mensais da conta (alcance, visitas, interações...) dos últimos `meses` meses, guardados em instagram_mensal por conta. */
export async function atualizarMesesInstagram(conta: ContaDaRede, meses: number, agora = new Date()): Promise<{ meses: number; erro?: string }> {
  const prov = provedor("instagram");
  if (!prov.metricasMes) return { meses: 0 };
  const contaId = conta.contaExternaId ?? "";
  const l = utcToLocal(agora);
  let ano = Number(l.date.slice(0, 4)), mes = Number(l.date.slice(5, 7)), n = 0, erro: string | undefined;
  for (let i = 0; i < meses; i++) {
    const periodo = `${ano}-${String(mes).padStart(2, "0")}`;
    try {
      const m = await prov.metricasMes(conta, ano, mes, agora);
      if (m) {
        await execute(
          `INSERT INTO instagram_mensal (conta_id, periodo, alcance, visualizacoes, visitas_perfil, interacoes, curtidas, comentarios, compartilhamentos, salvamentos, atualizado_em) VALUES (?,?,?,?,?,?,?,?,?,?,?)
           ON DUPLICATE KEY UPDATE alcance = VALUES(alcance), visualizacoes = VALUES(visualizacoes), visitas_perfil = VALUES(visitas_perfil), interacoes = VALUES(interacoes), curtidas = VALUES(curtidas),
             comentarios = VALUES(comentarios), compartilhamentos = VALUES(compartilhamentos), salvamentos = VALUES(salvamentos), atualizado_em = VALUES(atualizado_em)`,
          [contaId, periodo, m.alcance ?? null, m.visualizacoes ?? null, m.visitasPerfil ?? null, m.interacoes ?? null, m.curtidas ?? null, m.comentarios ?? null, m.compartilhamentos ?? null, m.salvamentos ?? null, agora]);
        n++;
      }
    } catch (e) {
      erro = mascarar(e instanceof Error ? e.message : "erro");
      await logIntegracao("instagram", "aviso", "metricas_mes_falhou", `${conta.nome ?? contaId} ${periodo}: ${erro}`);
    }
    mes--; if (mes < 1) { mes = 12; ano--; }
  }
  return { meses: n, erro };
}

export const JANELAS_DESEMPENHO = [7, 30, 90] as const;

/** Totais das janelas móveis (7/30/90 dias, mais a janela anterior de cada uma) guardados em instagram_janelas. */
export async function atualizarJanelasInstagram(conta: ContaDaRede, agora = new Date()): Promise<{ janelas: number; erro?: string }> {
  const prov = provedor("instagram");
  if (!prov.metricasPeriodo) return { janelas: 0 };
  const contaId = conta.contaExternaId ?? "";
  const hoje = utcToLocal(agora).date;
  let n = 0, erro: string | undefined;
  for (const dias of JANELAS_DESEMPENHO) {
    for (const quando of ["atual", "anterior"] as const) {
      const ate = quando === "atual" ? hoje : addDays(hoje, -dias);
      const de = addDays(ate, -(dias - 1));
      try {
        const m = await prov.metricasPeriodo(conta, localToUtc(de, "00:00"), localToUtc(addDays(ate, 1), "00:00"));
        if (!m) continue;
        await execute(
          `INSERT INTO instagram_janelas (conta_id, janela, quando, de, ate, alcance, visualizacoes, visitas_perfil, interacoes, curtidas, comentarios, compartilhamentos, salvamentos, atualizado_em) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
           ON DUPLICATE KEY UPDATE de = VALUES(de), ate = VALUES(ate), alcance = VALUES(alcance), visualizacoes = VALUES(visualizacoes), visitas_perfil = VALUES(visitas_perfil), interacoes = VALUES(interacoes),
             curtidas = VALUES(curtidas), comentarios = VALUES(comentarios), compartilhamentos = VALUES(compartilhamentos), salvamentos = VALUES(salvamentos), atualizado_em = VALUES(atualizado_em)`,
          [contaId, String(dias), quando, de, ate, m.alcance ?? null, m.visualizacoes ?? null, m.visitasPerfil ?? null, m.interacoes ?? null, m.curtidas ?? null, m.comentarios ?? null, m.compartilhamentos ?? null, m.salvamentos ?? null, agora]);
        n++;
      } catch (e) {
        erro = mascarar(e instanceof Error ? e.message : "erro");
        await logIntegracao("instagram", "aviso", "metricas_janela_falhou", `${conta.nome ?? contaId} ${dias} dias (${quando}): ${erro}`);
      }
    }
  }
  return { janelas: n, erro };
}

/** Atualiza agora os dados de todas as contas da rede, sem esperar o agendador. Mostra o erro de cada conta, se houver. */
export async function sincronizarContaAgora(actor: number, rede: Rede, agora = new Date(), meses = 2): Promise<{ posts: number; meses: number; contas: number; erro?: string }> {
  await assertCan(actor, "relatorios", "ver");
  const lista = await contasDaRede(rede, agora);
  if (!lista.length) return { posts: 0, meses: 0, contas: 0, erro: `${REDE_ROTULO[rede]} não conectada. Conecte em Configurações → Redes sociais.` };
  let posts = 0, mesesOk = 0; const erros: string[] = [];
  for (const c of lista) {
    const r = await sincronizarUmaConta(rede, c.conta, agora, { meses: rede === "instagram" ? meses : 0, forcar: true });
    posts += r.posts; mesesOk += r.meses;
    if (r.erro) erros.push(lista.length > 1 ? `${c.rotulo}: ${r.erro}` : r.erro);
    else if (r.posts === 0) erros.push(`${lista.length > 1 ? c.rotulo + ": " : ""}a ${REDE_ROTULO[rede]} não devolveu nenhum post.`);
  }
  return { posts, meses: mesesOk, contas: lista.length, erro: erros.length ? erros.join(" · ") : undefined };
}

/* ================= Lembretes (geram notificações internas; o push as entrega) ================= */
export async function gerarLembretes(agora = new Date()): Promise<{ prazos: number; proximas: number; atrasadas: number }> {
  const cfg = await lerConfig();
  const out = { prazos: 0, proximas: 0, atrasadas: 0 };
  const horizonte = new Date(agora.getTime() + cfg.lembretePrazoHoras * 3600_000);
  const prazos = await query<RowDataPacket>(
    `SELECT id, titulo, responsavel_id, prazo FROM publicacoes WHERE responsavel_id IS NOT NULL AND status IN ('rascunho','em_producao','ajustes_solicitados') AND prazo IS NOT NULL AND prazo > ? AND prazo <= ?`, [agora, horizonte]);
  for (const p of prazos) {
    const loc = utcToLocal(new Date(p.prazo));
    out.prazos += await notificar([Number(p.responsavel_id)], { tipo: "prazo", titulo: `Prazo próximo: ${p.titulo}`, corpo: `Entrega em ${loc.date.split("-").reverse().join("/")} às ${loc.time}.`, url: `/producao/${p.id}`, dedupeKey: `prazo:${p.id}:${new Date(p.prazo).getTime()}` });
  }
  const atrasadas = await query<RowDataPacket>(
    `SELECT id, titulo, responsavel_id, prazo FROM publicacoes WHERE responsavel_id IS NOT NULL AND status IN ('rascunho','em_producao','ajustes_solicitados') AND prazo IS NOT NULL AND prazo <= ? AND prazo > DATE_SUB(?, INTERVAL 7 DAY)`, [agora, agora]);
  for (const p of atrasadas) {
    out.atrasadas += await notificar([Number(p.responsavel_id)], { tipo: "prazo", titulo: `Prazo vencido: ${p.titulo}`, url: `/producao/${p.id}`, dedupeKey: `prazo-vencido:${p.id}:${new Date(p.prazo).getTime()}` });
  }
  const proximas = await query<RowDataPacket>(
    `SELECT id, titulo, responsavel_id, publicar_em FROM publicacoes WHERE status = 'agendado' AND publicar_em > ? AND publicar_em <= ?`, [agora, new Date(agora.getTime() + 3600_000)]);
  for (const p of proximas) {
    const quem = [...(await destinatariosCom("publicacao", "editar")), ...(p.responsavel_id ? [Number(p.responsavel_id)] : [])];
    out.proximas += await notificar(quem, { tipo: "publicacao", titulo: `Publica em breve: ${p.titulo}`, corpo: `Às ${utcToLocal(new Date(p.publicar_em)).time}.`, url: `/publicacoes`, dedupeKey: `proxima:${p.id}:${new Date(p.publicar_em).getTime()}` });
  }
  return out;
}

