import { createHash, timingSafeEqual } from "node:crypto";
import type { RowDataPacket } from "mysql2/promise";
import webpush from "web-push";
import { comTrava, execute, query } from "@/lib/db";
import { emSilencio } from "./notificacoes";
import { utcToLocal } from "@/lib/time";
import { DomainError } from "./errors";

/* ---------- Inscrições ---------- */
export type Inscricao = { endpoint: string; keys: { p256dh: string; auth: string } };
const sha = (s: string) => createHash("sha256").update(s).digest("hex");

export function validarInscricao(i: unknown): Inscricao {
  const o = i as Partial<Inscricao> | null;
  const ep = o?.endpoint, k = o?.keys;
  if (typeof ep !== "string" || ep.length > 600 || !/^https:\/\//.test(ep)) throw new DomainError("Inscrição inválida.");
  if (!k || typeof k.p256dh !== "string" || typeof k.auth !== "string" || k.p256dh.length > 200 || k.auth.length > 100 || !/^[A-Za-z0-9_-]+=*$/.test(k.p256dh) || !/^[A-Za-z0-9_-]+=*$/.test(k.auth)) throw new DomainError("Chaves de inscrição inválidas.");
  return { endpoint: ep, keys: { p256dh: k.p256dh, auth: k.auth } };
}

/** Um dispositivo pertence a um único usuário: reinscrever o mesmo endpoint o transfere para quem está logado. */
export async function inscrever(actor: number, i: Inscricao, userAgent: string | null) {
  await execute(
    `INSERT INTO push_subscriptions (user_id, endpoint_hash, endpoint, p256dh, auth, user_agent) VALUES (?,?,?,?,?,?)
     ON DUPLICATE KEY UPDATE user_id = VALUES(user_id), p256dh = VALUES(p256dh), auth = VALUES(auth), falhas = 0, user_agent = VALUES(user_agent)`,
    [actor, sha(i.endpoint), i.endpoint, i.keys.p256dh, i.keys.auth, userAgent?.slice(0, 255) ?? null]);
}
export async function cancelarInscricao(actor: number, endpoint: string) {
  await execute("DELETE FROM push_subscriptions WHERE endpoint_hash = ? AND user_id = ?", [sha(endpoint), actor]);
}
export async function dispositivos(actor: number) {
  const r = await query<RowDataPacket>("SELECT COUNT(*) n FROM push_subscriptions WHERE user_id = ?", [actor]);
  return Number(r[0].n);
}

/* ---------- Envio ---------- */
export type Enviador = (sub: Inscricao, payload: string) => Promise<{ statusCode: number }>;
let enviadorPadrao: Enviador | null = null;
/** Somente para testes/integrações: substitui o envio real. */
export const definirEnviador = (e: Enviador | null) => { enviadorPadrao = e; };

export function pushConfigurado() {
  return Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY && process.env.VAPID_SUBJECT);
}
function enviadorReal(): Enviador {
  webpush.setVapidDetails(process.env.VAPID_SUBJECT!, process.env.VAPID_PUBLIC_KEY!, process.env.VAPID_PRIVATE_KEY!);
  return async (sub, payload) => {
    try { const r = await webpush.sendNotification(sub, payload, { TTL: 3600, urgency: "normal" }); return { statusCode: r.statusCode }; }
    catch (e) { const code = (e as { statusCode?: number }).statusCode; if (code) return { statusCode: code }; throw e; }
  };
}

const LOCK = "nova_berith_push";
export type ResultadoEnvio = { processadas: number; enviadas: number; ignoradas: number; adiadas: number; expiradas: number; falhas: number; removidas: number; ocupado?: boolean };

/**
 * Processa notificações pendentes e elegíveis. Exclusão mútua (GET_LOCK) impede duas execuções simultâneas;
 * (notificação, dispositivo) é único: nunca envia duas vezes. Respeita preferências e horário de silêncio.
 */
export async function processarPush(agora = new Date()): Promise<ResultadoEnvio> {
  const vazio: ResultadoEnvio = { processadas: 0, enviadas: 0, ignoradas: 0, adiadas: 0, expiradas: 0, falhas: 0, removidas: 0 };
  const r = await comTrava(LOCK, () => executarPush(agora));
  return r.ocupado ? { ...vazio, ocupado: true } : r.valor;
}

async function executarPush(agora: Date): Promise<ResultadoEnvio> {
  const res: ResultadoEnvio = { processadas: 0, enviadas: 0, ignoradas: 0, adiadas: 0, expiradas: 0, falhas: 0, removidas: 0 };
  const enviar = enviadorPadrao ?? (pushConfigurado() ? enviadorReal() : null);
  if (!enviar) throw new Error("Web Push não configurado.");
  const pend = await query<RowDataPacket & { id: number; user_id: number; tipo: string; titulo: string; corpo: string | null; url: string | null; agendada_para: Date }>(
    "SELECT id, user_id, tipo, titulo, corpo, url, agendada_para FROM notificacoes WHERE push_status = 'pendente' AND agendada_para <= ? ORDER BY id LIMIT 200", [agora]);
  const hhmm = utcToLocal(agora).time;
  for (const n of pend) {
    res.processadas++;
    const [cfg] = await query<RowDataPacket>("SELECT push_ativo, TIME_FORMAT(silencio_inicio,'%H:%i') ini, TIME_FORMAT(silencio_fim,'%H:%i') fim FROM notificacao_config WHERE user_id = ?", [n.user_id]);
    const [tp] = await query<RowDataPacket>("SELECT ativo FROM notificacao_tipos WHERE user_id = ? AND tipo = ?", [n.user_id, n.tipo]);
    if ((cfg && !cfg.push_ativo) || (tp && !tp.ativo)) { await execute("UPDATE notificacoes SET push_status='ignorada' WHERE id = ?", [n.id]); res.ignoradas++; continue; }
    if (emSilencio(hhmm, cfg?.ini ?? null, cfg?.fim ?? null)) {
      if (agora.getTime() - new Date(n.agendada_para).getTime() > 24 * 3600_000) { await execute("UPDATE notificacoes SET push_status='expirada' WHERE id = ?", [n.id]); res.expiradas++; } else res.adiadas++;
      continue;
    }
    const subs = await query<RowDataPacket & { id: number; endpoint: string; p256dh: string; auth: string; falhas: number }>("SELECT id, endpoint, p256dh, auth, falhas FROM push_subscriptions WHERE user_id = ?", [n.user_id]);
    if (subs.length === 0) { await execute("UPDATE notificacoes SET push_status='ignorada' WHERE id = ?", [n.id]); res.ignoradas++; continue; }
    const payload = JSON.stringify({ id: n.id, titulo: n.titulo, corpo: n.corpo, url: n.url ?? "/notificacoes" });
    for (const s of subs) {
      const claim = await execute("INSERT IGNORE INTO push_entregas (notificacao_id, subscription_id, status) VALUES (?, ?, 'falhou')", [n.id, s.id]);
      if (claim.affectedRows === 0) continue; // já tentado: sem duplicidade
      try {
        const r = await enviar({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload);
        if (r.statusCode >= 200 && r.statusCode < 300) { await execute("UPDATE push_entregas SET status='enviada', http_status=? WHERE notificacao_id=? AND subscription_id=?", [r.statusCode, n.id, s.id]); res.enviadas++; }
        else if (r.statusCode === 404 || r.statusCode === 410) {
          await execute("UPDATE push_entregas SET status='removida', http_status=? WHERE notificacao_id=? AND subscription_id=?", [r.statusCode, n.id, s.id]);
          await execute("DELETE FROM push_subscriptions WHERE id = ?", [s.id]); res.removidas++; // inscrição inválida/expirada
        } else {
          await execute("UPDATE push_entregas SET http_status=?, erro='resposta do serviço de push' WHERE notificacao_id=? AND subscription_id=?", [r.statusCode, n.id, s.id]);
          await execute("UPDATE push_subscriptions SET falhas = falhas + 1 WHERE id = ?", [s.id]);
          if (s.falhas + 1 >= 5) await execute("DELETE FROM push_subscriptions WHERE id = ?", [s.id]);
          res.falhas++;
        }
      } catch (e) {
        await execute("UPDATE push_entregas SET erro=? WHERE notificacao_id=? AND subscription_id=?", [(e instanceof Error ? e.message : "erro").slice(0, 200), n.id, s.id]);
        res.falhas++;
      }
    }
    await execute("UPDATE notificacoes SET push_status='enviada', push_em=UTC_TIMESTAMP() WHERE id = ?", [n.id]);
  }
  return res;
}

/** Comparação em tempo constante do segredo do agendador. Segredo vazio/curto nunca autoriza. */
export function segredoValido(recebido: string | null, esperado = process.env.CRON_SECRET): boolean {
  if (!esperado || esperado.length < 24 || !recebido) return false;
  const a = Buffer.from(createHash("sha256").update(recebido).digest("hex")), b = Buffer.from(createHash("sha256").update(esperado).digest("hex"));
  return a.length === b.length && timingSafeEqual(a, b);
}
