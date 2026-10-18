import { chamar, erroPlataforma, num, obj, str } from "./http";
import type { ContaAtiva, ConteudoPublicar, MetricasColetadas, MetricasConta, Provedor, ResultadoPublicacao, TokensOAuth } from "./tipos";

/** TikTok — Content Posting API (v2). Publicação direta exige app auditado pelo TikTok; antes disso, só vídeos privados. */
const api = () => process.env.TIKTOK_API_BASE || "https://open.tiktokapis.com";
const auth = () => process.env.TIKTOK_AUTH_BASE || "https://www.tiktok.com";
const key = () => process.env.TIKTOK_CLIENT_KEY ?? "";
const secret = () => process.env.TIKTOK_CLIENT_SECRET ?? "";
const ESCOPOS = ["user.info.basic", "user.info.stats", "video.publish", "video.list"];
const form = (o: Record<string, string>) => new URLSearchParams(o).toString();

async function token(corpo: Record<string, string>): Promise<TokensOAuth & { openId: string }> {
  const r = await chamar(`${api()}/v2/oauth/token/`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: form({ client_key: key(), client_secret: secret(), ...corpo }) });
  const j = obj(r.json);
  const at = str(j.access_token);
  if (r.status !== 200 || !at) throw new Error(erroPlataforma(r.json, r.texto, r.status));
  const exp = num(j.expires_in);
  return { accessToken: at, refreshToken: str(j.refresh_token), expiraEm: exp ? new Date(Date.now() + exp * 1000) : null, escopos: str(j.scope), openId: str(j.open_id) ?? "" };
}

const bearer = (t: string) => ({ Authorization: `Bearer ${t}`, "Content-Type": "application/json; charset=UTF-8" });

export const tiktok: Provedor = {
  rede: "tiktok",
  configurado: () => Boolean(key() && secret()),
  variaveis: () => ["TIKTOK_CLIENT_KEY", "TIKTOK_CLIENT_SECRET"],
  escopos: () => ESCOPOS,
  urlAutorizacao: ({ state, redirectUri }) =>
    `${auth()}/v2/auth/authorize/?${form({ client_key: key(), scope: ESCOPOS.join(","), response_type: "code", redirect_uri: redirectUri, state })}`,
  async trocarCodigo({ code, redirectUri }) {
    const t = await token({ code, grant_type: "authorization_code", redirect_uri: redirectUri });
    const u = await chamar(`${api()}/v2/user/info/?fields=open_id,display_name,username`, { headers: bearer(t.accessToken) });
    const d = obj(obj(obj(u.json).data).user);
    return { tokens: t, perfil: { contaExternaId: t.openId || (str(d.open_id) ?? ""), nome: str(d.display_name) ?? str(d.username) ?? "TikTok" } };
  },
  async renovar({ refreshToken }) {
    if (!refreshToken) throw new Error("Sem refresh token: reconecte a conta do TikTok.");
    return token({ grant_type: "refresh_token", refresh_token: refreshToken });
  },
  async publicar(conta: ContaAtiva, c: ConteudoPublicar): Promise<ResultadoPublicacao> {
    const v = c.midias.find((m) => m.tipo === "video");
    if (!v) return { ok: false, erro: "O TikTok exige um vídeo.", definitivo: true };
    const falha = (r: { status: number; json: unknown; texto: string }): ResultadoPublicacao => ({ ok: false, erro: erroPlataforma(r.json, r.texto, r.status), httpStatus: r.status, reconectar: r.status === 401, definitivo: r.status >= 400 && r.status < 500 });
    const info = await chamar(`${api()}/v2/post/publish/creator_info/query/`, { method: "POST", headers: bearer(conta.token), body: "{}" });
    if (info.status !== 200) return falha(info);
    const opcoes = obj(obj(info.json).data).privacy_level_options;
    const permitidas = Array.isArray(opcoes) ? opcoes.map(String) : ["SELF_ONLY"];
    const desejada = process.env.TIKTOK_PRIVACY_LEVEL || "PUBLIC_TO_EVERYONE";
    const privacidade = permitidas.includes(desejada) ? desejada : permitidas[0] ?? "SELF_ONLY";
    const r = await chamar(`${api()}/v2/post/publish/video/init/`, {
      method: "POST", headers: bearer(conta.token),
      body: JSON.stringify({ post_info: { title: c.texto.slice(0, 2200), privacy_level: privacidade, disable_comment: false, disable_duet: false, disable_stitch: false }, source_info: { source: "PULL_FROM_URL", video_url: v.url } }),
    });
    const j = obj(r.json), id = str(obj(j.data).publish_id);
    const erro = obj(j.error);
    if (r.status !== 200 || !id || (erro.code && erro.code !== "ok")) return falha(r);
    // O TikTok processa de forma assíncrona; consultamos o status algumas vezes.
    for (let i = 0; i < 12; i++) {
      await new Promise((res) => setTimeout(res, Number(process.env.TIKTOK_POLL_MS ?? 5000)));
      const s = await chamar(`${api()}/v2/post/publish/status/fetch/`, { method: "POST", headers: bearer(conta.token), body: JSON.stringify({ publish_id: id }) });
      const st = str(obj(obj(s.json).data).status);
      if (st === "PUBLISH_COMPLETE") {
        const ids = obj(obj(s.json).data).publicaly_available_post_id;
        const pid = Array.isArray(ids) && ids[0] != null ? String(ids[0]) : id;
        return { ok: true, idExterno: pid, url: null };
      }
      if (st === "FAILED") return { ok: false, erro: `O TikTok recusou o vídeo: ${str(obj(obj(s.json).data).fail_reason) ?? "motivo não informado"}.`, definitivo: true };
    }
    return { ok: false, erro: "O TikTok ainda está processando o vídeo. Confira no aplicativo do TikTok antes de reprocessar para não duplicar.", definitivo: true };
  },
  async metricasPublicacao(conta, idExterno): Promise<MetricasColetadas | null> {
    const r = await chamar(`${api()}/v2/video/query/?fields=id,view_count,like_count,comment_count,share_count`, { method: "POST", headers: bearer(conta.token), body: JSON.stringify({ filters: { video_ids: [idExterno] } }) });
    const v = obj(Array.isArray(obj(obj(r.json).data).videos) ? (obj(obj(r.json).data).videos as unknown[])[0] : null);
    if (r.status !== 200 || !str(v.id)) return null;
    return { visualizacoes: num(v.view_count), curtidas: num(v.like_count), comentarios: num(v.comment_count), compartilhamentos: num(v.share_count) };
  },
  async metricasConta(conta): Promise<MetricasConta | null> {
    const r = await chamar(`${api()}/v2/user/info/?fields=follower_count`, { headers: bearer(conta.token) });
    const u = obj(obj(obj(r.json).data).user);
    return r.status === 200 ? { seguidores: num(u.follower_count) } : null;
  },
};
