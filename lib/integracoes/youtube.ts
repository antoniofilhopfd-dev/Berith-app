import { createReadStream, statSync } from "node:fs";
import { Readable } from "node:stream";
import { chamar, erroPlataforma, num, obj, str } from "./http";
import type { ContaAtiva, ConteudoPublicar, MetricasColetadas, MetricasConta, Provedor, ResultadoPublicacao, TokensOAuth } from "./tipos";

/** YouTube — Data API v3 (upload resumível) com OAuth do Google. Projetos de API não verificados publicam apenas como privado. */
const auth = () => process.env.GOOGLE_AUTH_BASE || "https://accounts.google.com";
const tokenUrl = () => (process.env.GOOGLE_TOKEN_BASE || "https://oauth2.googleapis.com") + "/token";
const api = () => process.env.YOUTUBE_API_BASE || "https://www.googleapis.com";
const id = () => process.env.GOOGLE_CLIENT_ID ?? "";
const secret = () => process.env.GOOGLE_CLIENT_SECRET ?? "";
const ESCOPOS = ["https://www.googleapis.com/auth/youtube.upload", "https://www.googleapis.com/auth/youtube.readonly", "https://www.googleapis.com/auth/yt-analytics.readonly"];
const form = (o: Record<string, string>) => new URLSearchParams(o).toString();

async function token(corpo: Record<string, string>): Promise<TokensOAuth> {
  const r = await chamar(tokenUrl(), { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: form({ client_id: id(), client_secret: secret(), ...corpo }) });
  const j = obj(r.json), at = str(j.access_token);
  if (r.status !== 200 || !at) throw new Error(erroPlataforma(r.json, r.texto, r.status));
  const exp = num(j.expires_in);
  return { accessToken: at, refreshToken: str(j.refresh_token), expiraEm: exp ? new Date(Date.now() + exp * 1000) : null, escopos: str(j.scope) };
}
const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });

export const youtube: Provedor = {
  rede: "youtube",
  configurado: () => Boolean(id() && secret()),
  variaveis: () => ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"],
  escopos: () => ESCOPOS,
  urlAutorizacao: ({ state, redirectUri }) => `${auth()}/o/oauth2/v2/auth?${form({ client_id: id(), redirect_uri: redirectUri, response_type: "code", scope: ESCOPOS.join(" "), access_type: "offline", prompt: "consent", state, include_granted_scopes: "true" })}`,
  async trocarCodigo({ code, redirectUri }) {
    const t = await token({ code, grant_type: "authorization_code", redirect_uri: redirectUri });
    const c = await chamar(`${api()}/youtube/v3/channels?part=snippet&mine=true`, { headers: bearer(t.accessToken) });
    const item = obj(Array.isArray(obj(c.json).items) ? (obj(c.json).items as unknown[])[0] : null);
    const cid = str(item.id);
    if (c.status !== 200 || !cid) throw new Error("Nenhum canal do YouTube encontrado nesta conta Google.");
    return { tokens: t, perfil: { contaExternaId: cid, nome: str(obj(item.snippet).title) ?? "YouTube" } };
  },
  async renovar({ refreshToken }) {
    if (!refreshToken) throw new Error("Sem refresh token: reconecte a conta do YouTube.");
    const t = await token({ grant_type: "refresh_token", refresh_token: refreshToken });
    return { ...t, refreshToken: t.refreshToken ?? refreshToken };
  },
  async publicar(conta: ContaAtiva, c: ConteudoPublicar): Promise<ResultadoPublicacao> {
    const v = c.midias.find((m) => m.tipo === "video");
    if (!v) return { ok: false, erro: "O YouTube exige um vídeo.", definitivo: true };
    const falha = (r: { status: number; json: unknown; texto: string }): ResultadoPublicacao => ({ ok: false, erro: erroPlataforma(r.json, r.texto, r.status), httpStatus: r.status, reconectar: r.status === 401, definitivo: r.status >= 400 && r.status < 500 && r.status !== 429 });
    const titulo = c.titulo.slice(0, 100);
    const descricao = c.formato === "short" && !/#shorts/i.test(c.texto) ? `${c.texto}\n\n#Shorts`.trim() : c.texto;
    const privacidade = process.env.YOUTUBE_PRIVACY || "public";
    const ini = await chamar(`${api()}/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status`, {
      method: "POST",
      headers: { ...bearer(conta.token), "Content-Type": "application/json; charset=UTF-8", "X-Upload-Content-Type": v.mime, "X-Upload-Content-Length": String(v.tamanho) },
      body: JSON.stringify({ snippet: { title: titulo, description: descricao.slice(0, 5000), categoryId: "22" }, status: { privacyStatus: privacidade, selfDeclaredMadeForKids: false } }),
    });
    const destino = ini.headers.get("location");
    if (ini.status !== 200 || !destino) return falha(ini);
    // Envio do arquivo direto do disco, em fluxo.
    const tam = statSync(v.caminhoArquivo).size;
    const corpo = Readable.toWeb(createReadStream(v.caminhoArquivo)) as unknown as BodyInit;
    const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 30 * 60_000);
    try {
      const r = await fetch(destino, { method: "PUT", headers: { "Content-Type": v.mime, "Content-Length": String(tam) }, body: corpo, signal: ctrl.signal, duplex: "half" } as RequestInit);
      const texto = await r.text(); let json: unknown = null; try { json = JSON.parse(texto); } catch { /* */ }
      const vid = str(obj(json).id);
      if (r.status >= 300 || !vid) return falha({ status: r.status, json, texto });
      return { ok: true, idExterno: vid, url: `https://www.youtube.com/watch?v=${vid}` };
    } catch (e) {
      return { ok: false, erro: `Falha no envio do vídeo: ${e instanceof Error ? e.message : "erro"}. Confira no YouTube Studio antes de reprocessar.`, definitivo: true };
    } finally { clearTimeout(t); }
  },
  async metricasPublicacao(conta, idExterno): Promise<MetricasColetadas | null> {
    const r = await chamar(`${api()}/youtube/v3/videos?part=statistics&id=${encodeURIComponent(idExterno)}`, { headers: bearer(conta.token) });
    const s = obj(obj(Array.isArray(obj(r.json).items) ? (obj(r.json).items as unknown[])[0] : null).statistics);
    if (r.status !== 200 || Object.keys(s).length === 0) return null;
    const n = (v: unknown) => (v == null ? null : Number(v));
    return { visualizacoes: n(s.viewCount), curtidas: n(s.likeCount), comentarios: n(s.commentCount) };
  },
  async metricasConta(conta): Promise<MetricasConta | null> {
    const r = await chamar(`${api()}/youtube/v3/channels?part=statistics&mine=true`, { headers: bearer(conta.token) });
    const s = obj(obj(Array.isArray(obj(r.json).items) ? (obj(r.json).items as unknown[])[0] : null).statistics);
    if (r.status !== 200) return null;
    return { seguidores: s.hiddenSubscriberCount ? null : (s.subscriberCount != null ? Number(s.subscriberCount) : null), visualizacoes: s.viewCount != null ? Number(s.viewCount) : null };
  },
};
