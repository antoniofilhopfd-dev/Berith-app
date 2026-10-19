import type { Formato, Rede } from "@/lib/editorial";
import { localToUtc } from "@/lib/time";
import { chamar, erroPlataforma, num, obj, str, urlDaPlataformaValida } from "./http";
import type { ConteudoPublicar, ContaAtiva, MetricasColetadas, MetricasConta, MetricasMes, PostExterno, Provedor, ResultadoPublicacao, TokensOAuth, PerfilConta } from "./tipos";

/** Meta (Instagram e Facebook) — Graph API oficial. Versão e bases configuráveis por ambiente. */
const versao = () => process.env.META_GRAPH_VERSION || "v23.0";
const graph = () => (process.env.META_GRAPH_BASE || "https://graph.facebook.com") + "/" + versao();
const dialogo = () => (process.env.META_DIALOG_BASE || "https://www.facebook.com") + "/" + versao() + "/dialog/oauth";
const appId = () => process.env.META_APP_ID ?? "";
const appSecret = () => process.env.META_APP_SECRET ?? "";

const ESCOPOS_FB = ["pages_show_list", "pages_manage_posts", "pages_read_engagement", "business_management"];
const ESCOPOS_IG = ["instagram_basic", "instagram_content_publish", "instagram_manage_insights", "pages_show_list", "pages_read_engagement", "business_management"];

const form = (o: Record<string, string>) => new URLSearchParams(o).toString();
async function get(path: string, token: string, extra: Record<string, string> = {}) {
  return chamar(`${graph()}${path}?${form({ ...extra, access_token: token })}`);
}
async function post(path: string, token: string, corpo: Record<string, string>) {
  return chamar(`${graph()}${path}`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: form({ ...corpo, access_token: token }) });
}
const tokenInvalido = (status: number, json: unknown) => {
  const e = obj(obj(json).error);
  return status === 401 || e.code === 190 || e.type === "OAuthException" && [102, 190].includes(Number(e.code));
};

async function trocarCodigoMeta(code: string, redirectUri: string, comInstagram = false): Promise<{ tokens: TokensOAuth; pagina: { id: string; nome: string; token: string; igId: string | null }; outras: { id: string; token: string; igId: string; usuario: string }[] }> {
  const r1 = await chamar(`${graph()}/oauth/access_token?${form({ client_id: appId(), client_secret: appSecret(), redirect_uri: redirectUri, code })}`);
  const curto = str(obj(r1.json).access_token);
  if (r1.status !== 200 || !curto) throw new Error(erroPlataforma(r1.json, r1.texto, r1.status));
  const r2 = await chamar(`${graph()}/oauth/access_token?${form({ grant_type: "fb_exchange_token", client_id: appId(), client_secret: appSecret(), fb_exchange_token: curto })}`);
  const longo = str(obj(r2.json).access_token) ?? curto;
  const expira = num(obj(r2.json).expires_in);
  const r3 = await get("/me/accounts", longo, { fields: "id,name,access_token,instagram_business_account{id,username}", limit: "50" });
  if (r3.status !== 200) throw new Error(erroPlataforma(r3.json, r3.texto, r3.status));
  const paginas = (Array.isArray(obj(r3.json).data) ? (obj(r3.json).data as unknown[]) : []).map(obj);
  const alvo = process.env.META_PAGE_ID
    ? paginas.find((p) => str(p.id) === process.env.META_PAGE_ID)
    : comInstagram ? paginas.find((p) => str(obj(p.instagram_business_account).id)) ?? paginas[0] : paginas[0];
  if (!alvo) throw new Error("Nenhuma Página do Facebook encontrada para esta conta (ou a Página indicada em META_PAGE_ID não foi autorizada).");
  const ig = obj(alvo.instagram_business_account);
  // Demais Páginas do mesmo login que têm Instagram profissional: viram contas só de leitura (métricas).
  const outras = paginas.filter((p) => p !== alvo && str(obj(p.instagram_business_account).id) && str(p.access_token))
    .map((p) => ({ id: str(p.id)!, token: str(p.access_token)!, igId: str(obj(p.instagram_business_account).id)!, usuario: str(obj(p.instagram_business_account).username) ?? str(p.name) ?? "Instagram" }));
  return {
    outras,
    tokens: { accessToken: longo, expiraEm: expira ? new Date(Date.now() + expira * 1000) : null },
    pagina: { id: str(alvo.id)!, nome: str(alvo.name) ?? "Página", token: str(alvo.access_token) ?? longo, igId: str(ig.id) },
  };
}

function base(rede: Rede, escopos: string[]): Pick<Provedor, "configurado" | "variaveis" | "escopos" | "urlAutorizacao"> {
  return {
    configurado: () => Boolean(appId() && appSecret()),
    variaveis: () => ["META_APP_ID", "META_APP_SECRET"],
    escopos: () => escopos,
    urlAutorizacao: ({ state, redirectUri }) => `${dialogo()}?${form({ client_id: appId(), redirect_uri: redirectUri, state, scope: escopos.join(","), response_type: "code" })}`,
  };
}

/* ---------------- Instagram ---------------- */
async function aguardarContainer(id: string, token: string, tentativas = 30): Promise<string | null> {
  for (let i = 0; i < tentativas; i++) {
    const r = await get(`/${id}`, token, { fields: "status_code,status" });
    const s = str(obj(r.json).status_code);
    if (s === "FINISHED") return null;
    if (s === "ERROR" || s === "EXPIRED") return `O Instagram recusou o arquivo (${str(obj(r.json).status) ?? s}).`;
    await new Promise((res) => setTimeout(res, Number(process.env.META_POLL_MS ?? 5000)));
  }
  return "Tempo esgotado aguardando o Instagram processar o vídeo.";
}

async function publicarInstagram(conta: ContaAtiva, c: ConteudoPublicar): Promise<ResultadoPublicacao> {
  const ig = conta.contaExternaId; const t = conta.token;
  if (!ig) return { ok: false, erro: "Conta do Instagram sem identificador. Reconecte a conta.", definitivo: true, reconectar: true };
  const falha = (r: { status: number; json: unknown; texto: string }): ResultadoPublicacao => ({ ok: false, erro: erroPlataforma(r.json, r.texto, r.status), httpStatus: r.status, reconectar: tokenInvalido(r.status, r.json), definitivo: r.status >= 400 && r.status < 500 });
  const criar = async (corpo: Record<string, string>) => {
    const r = await post(`/${ig}/media`, t, corpo);
    const id = str(obj(r.json).id);
    return r.status === 200 && id ? { id } : { falha: falha(r) };
  };
  const legenda = c.texto;
  let container: string;
  if (c.formato === "carrossel") {
    const filhos: string[] = [];
    for (const m of c.midias) {
      const r = await criar(m.tipo === "video" ? { media_type: "VIDEO", video_url: m.url, is_carousel_item: "true" } : { image_url: m.url, is_carousel_item: "true" });
      if ("falha" in r) return r.falha!;
      if (m.tipo === "video") { const e = await aguardarContainer(r.id, t); if (e) return { ok: false, erro: e, definitivo: true }; }
      filhos.push(r.id);
    }
    const r = await criar({ media_type: "CAROUSEL", children: filhos.join(","), caption: legenda });
    if ("falha" in r) return r.falha!;
    container = r.id;
  } else {
    const m = c.midias[0];
    if (!m) return { ok: false, erro: "Sem mídia para publicar.", definitivo: true };
    let corpo: Record<string, string>;
    if (c.formato === "reels") corpo = { media_type: "REELS", video_url: m.url, caption: legenda };
    else if (c.formato === "stories") corpo = m.tipo === "video" ? { media_type: "STORIES", video_url: m.url } : { media_type: "STORIES", image_url: m.url };
    else corpo = { image_url: m.url, caption: legenda };
    const r = await criar(corpo);
    if ("falha" in r) return r.falha!;
    container = r.id;
    if (m.tipo === "video") { const e = await aguardarContainer(container, t); if (e) return { ok: false, erro: e, definitivo: true }; }
  }
  const pub = await post(`/${ig}/media_publish`, t, { creation_id: container });
  const id = str(obj(pub.json).id);
  if (pub.status !== 200 || !id) return falha(pub);
  const link = await get(`/${id}`, t, { fields: "permalink" });
  return { ok: true, idExterno: id, url: str(obj(link.json).permalink) };
}

/** Valor de um insight do Graph: `values[0].value` (formato clássico) ou `total_value.value` (formato novo). */
function valorInsight(json: unknown): number | null {
  const lista = obj(json).data;
  const d = Array.isArray(lista) ? obj(lista[0]) : {};
  return num(obj(Array.isArray(d.values) ? d.values[0] : null).value) ?? num(obj(d.total_value).value);
}

async function insightsIg(conta: ContaAtiva, idExterno: string, _formato: Formato): Promise<MetricasColetadas | null> {
  void _formato;
  const m: MetricasColetadas = {};
  // Cada métrica é pedida separadamente: o Instagram recusa a chamada inteira se uma não existir para o tipo de mídia.
  const lista: [keyof MetricasColetadas, string][] = [["alcance", "reach"], ["curtidas", "likes"], ["comentarios", "comments"], ["compartilhamentos", "shares"], ["salvamentos", "saved"], ["visualizacoes", "views"]];
  let algum = false;
  for (const [campo, metrica] of lista) {
    const r = await get(`/${idExterno}/insights`, conta.token, { metric: metrica });
    const v = r.status === 200 ? valorInsight(r.json) : null;
    if (v != null) { m[campo] = v; algum = true; }
  }
  return algum ? m : null;
}

const LIMITE_INSIGHTS_POSTS = 40;
const miniaturaHttps = (u: string | null) => (u && /^https:\/\/[^\s"'<>]+$/.test(u) ? u.slice(0, 1000) : null);

const METRICAS_MES: [keyof MetricasMes, string][] = [
  ["alcance", "reach"], ["visualizacoes", "views"], ["visitasPerfil", "profile_views"], ["interacoes", "total_interactions"],
  ["curtidas", "likes"], ["comentarios", "comments"], ["compartilhamentos", "shares"], ["salvamentos", "saves"],
];

/** Totais da janela [since, until] (epoch s). Pede em lote; se a Meta recusar, pede uma a uma e segue com as que existirem. */
async function totaisJanela(conta: ContaAtiva, since: number, until: number): Promise<{ valores: Partial<Record<keyof MetricasMes, number>>; erro: string | null }> {
  const valores: Partial<Record<keyof MetricasMes, number>> = {};
  const ler = (json: unknown) => {
    for (const d of (Array.isArray(obj(json).data) ? (obj(json).data as unknown[]) : []).map(obj)) {
      const campo = METRICAS_MES.find(([, nome]) => nome === d.name)?.[0];
      const v = num(obj(d.total_value).value);
      if (campo && v != null) valores[campo] = v;
    }
  };
  const base = { metric_type: "total_value", period: "day", since: String(since), until: String(until) };
  const lote = await get(`/${conta.contaExternaId}/insights`, conta.token, { ...base, metric: METRICAS_MES.map(([, n]) => n).join(",") });
  if (lote.status === 200) { ler(lote.json); return { valores, erro: null }; }
  let ultimoErro = erroPlataforma(lote.json, lote.texto, lote.status);
  for (const [, nome] of METRICAS_MES) {
    const r = await get(`/${conta.contaExternaId}/insights`, conta.token, { ...base, metric: nome });
    if (r.status === 200) ler(r.json); else ultimoErro = erroPlataforma(r.json, r.texto, r.status);
  }
  return { valores, erro: Object.keys(valores).length ? null : ultimoErro };
}

export const instagram: Provedor = {
  rede: "instagram", ...base("instagram", ESCOPOS_IG),
  async trocarCodigo({ code, redirectUri }) {
    const { tokens, pagina, outras } = await trocarCodigoMeta(code, redirectUri, true);
    if (!pagina.igId) throw new Error("A Página do Facebook encontrada não tem uma conta profissional do Instagram vinculada.");
    const u = await get(`/${pagina.igId}`, pagina.token, { fields: "username,name" });
    const perfil: PerfilConta = { contaExternaId: pagina.igId, nome: str(obj(u.json).username) ? `@${str(obj(u.json).username)}` : "Instagram", meta: { pageId: pagina.id }, extras: outras.map((o) => ({ contaExternaId: o.igId, nome: o.usuario.startsWith("@") ? o.usuario : `@${o.usuario}`, token: o.token, meta: { pageId: o.id } })) };
    return { tokens: { ...tokens, accessToken: pagina.token, expiraEm: null }, perfil };
  },
  async renovar() { throw new Error("Tokens de Página do Meta não são renovados: reconecte a conta se o acesso for revogado."); },
  publicar: publicarInstagram,
  metricasPublicacao: insightsIg,
  async metricasConta(conta) {
    if (!conta.contaExternaId) return null;
    const r = await get(`/${conta.contaExternaId}`, conta.token, { fields: "followers_count" });
    if (r.status !== 200) return null;
    const m: MetricasConta = { seguidores: num(obj(r.json).followers_count) };
    // Alcance e visualizações do último dia; se a conta não os fornecer, ficam em branco (nunca estimados).
    for (const [campo, metrica] of [["alcance", "reach"], ["visualizacoes", "views"]] as const) {
      const x = await get(`/${conta.contaExternaId}/insights`, conta.token, { metric: metrica, period: "day", metric_type: "total_value" });
      const v = x.status === 200 ? valorInsight(x.json) : null;
      if (v != null) m[campo] = v;
    }
    return m;
  },
  async metricasMes(conta, ano, mes, agora = new Date()) {
    if (!conta.contaExternaId) return null;
    const mm = (n: number) => String(n).padStart(2, "0");
    const ini = localToUtc(`${ano}-${mm(mes)}-01`, "00:00");
    const prox = mes === 12 ? `${ano + 1}-01-01` : `${ano}-${mm(mes + 1)}-01`;
    const fimMes = localToUtc(prox, "00:00");
    const fim = new Date(Math.min(fimMes.getTime(), agora.getTime()));
    if (fim <= ini) return null; // mês ainda não começou
    const soma: MetricasMes = {};
    let inicio = ini.getTime(), ultimoErro: string | null = null, algum = false;
    // A Meta limita cada consulta a 30 dias: meses de 31 dias vão em duas janelas (o alcance somado de janelas é aproximado).
    while (inicio < fim.getTime()) {
      const fimJanela = Math.min(inicio + 30 * 86_400_000, fim.getTime());
      const r = await totaisJanela(conta, Math.floor(inicio / 1000), Math.floor(fimJanela / 1000));
      if (r.erro) ultimoErro = r.erro;
      for (const [k, v] of Object.entries(r.valores) as [keyof MetricasMes, number][]) { soma[k] = (soma[k] ?? 0) + v; algum = true; }
      inicio = fimJanela;
    }
    if (!algum) throw new Error(ultimoErro ?? "A Meta não devolveu métricas para o período.");
    return soma;
  },
  async listarPostsConta(conta, desde, limite) {
    if (!conta.contaExternaId) return [];
    const out: PostExterno[] = [];
    let url: string | null = null;
    let primeira = true;
    while (out.length < limite) {
      const r: Awaited<ReturnType<typeof get>> = primeira
        ? await get(`/${conta.contaExternaId}/media`, conta.token, { fields: "id,caption,media_type,media_product_type,permalink,timestamp,like_count,comments_count,thumbnail_url,media_url", limit: String(Math.min(50, limite)) })
        : await chamar(url!);
      primeira = false;
      if (r.status !== 200) throw new Error(erroPlataforma(r.json, r.texto, r.status));
      const lote = Array.isArray(obj(r.json).data) ? (obj(r.json).data as unknown[]).map(obj) : [];
      let passouDoLimite = false;
      for (const p of lote) {
        const id = str(p.id), ts = str(p.timestamp);
        if (!id || !ts) continue;
        const quando = new Date(ts);
        if (Number.isNaN(quando.getTime())) continue;
        if (quando < desde) { passouDoLimite = true; break; }
        const post: PostExterno = {
          idExterno: id, legenda: str(p.caption), url: str(p.permalink), publicadoEm: quando,
          tipo: str(p.media_product_type) === "REELS" ? "REELS" : str(p.media_type),
          miniatura: miniaturaHttps(str(p.thumbnail_url) ?? (["IMAGE", "CAROUSEL_ALBUM"].includes(str(p.media_type) ?? "") ? str(p.media_url) : null)),
          curtidas: num(p.like_count), comentarios: num(p.comments_count),
        };
        const ins = out.length < LIMITE_INSIGHTS_POSTS ? await insightsIg(conta, id, "post") : null; // alcance/salvamentos só dos posts mais recentes (limita as chamadas)
        if (ins) { post.alcance = ins.alcance; post.compartilhamentos = ins.compartilhamentos; post.salvamentos = ins.salvamentos; post.visualizacoes = ins.visualizacoes; post.curtidas = post.curtidas ?? ins.curtidas; post.comentarios = post.comentarios ?? ins.comentarios; }
        out.push(post);
        if (out.length >= limite) break;
      }
      const proxima = str(obj(obj(r.json).paging).next);
      if (passouDoLimite || !proxima || lote.length === 0) break;
      if (!urlDaPlataformaValida(proxima, ["facebook.com"], Boolean(process.env.META_GRAPH_BASE))) break;
      url = proxima;
    }
    return out;
  },
};

/* ---------------- Facebook ---------------- */
async function publicarFacebook(conta: ContaAtiva, c: ConteudoPublicar): Promise<ResultadoPublicacao> {
  const page = conta.contaExternaId; const t = conta.token;
  if (!page) return { ok: false, erro: "Conta do Facebook sem Página. Reconecte a conta.", definitivo: true, reconectar: true };
  const falha = (r: { status: number; json: unknown; texto: string }): ResultadoPublicacao => ({ ok: false, erro: erroPlataforma(r.json, r.texto, r.status), httpStatus: r.status, reconectar: tokenInvalido(r.status, r.json), definitivo: r.status >= 400 && r.status < 500 });
  const link = async (id: string) => { const r = await get(`/${id}`, t, { fields: "permalink_url" }); const u = str(obj(r.json).permalink_url); return u ? (u.startsWith("http") ? u : `https://www.facebook.com${u}`) : null; };
  const imagens = c.midias.filter((m) => m.tipo === "imagem");
  const video = c.midias.find((m) => m.tipo === "video");

  if (c.formato === "post" || c.formato === "carrossel") {
    if (imagens.length === 0) {
      const r = await post(`/${page}/feed`, t, { message: c.texto });
      const id = str(obj(r.json).id); if (r.status !== 200 || !id) return falha(r);
      return { ok: true, idExterno: id, url: await link(id) };
    }
    if (imagens.length === 1) {
      const r = await post(`/${page}/photos`, t, { url: imagens[0].url, caption: c.texto, published: "true" });
      const id = str(obj(r.json).post_id) ?? str(obj(r.json).id); if (r.status !== 200 || !id) return falha(r);
      return { ok: true, idExterno: id, url: await link(id) };
    }
    const anexos: Record<string, string> = { message: c.texto };
    for (let i = 0; i < imagens.length; i++) {
      const r = await post(`/${page}/photos`, t, { url: imagens[i].url, published: "false" });
      const fb = str(obj(r.json).id); if (r.status !== 200 || !fb) return falha(r);
      anexos[`attached_media[${i}]`] = JSON.stringify({ media_fbid: fb });
    }
    const r = await post(`/${page}/feed`, t, anexos);
    const id = str(obj(r.json).id); if (r.status !== 200 || !id) return falha(r);
    return { ok: true, idExterno: id, url: await link(id) };
  }
  if (c.formato === "video") {
    if (!video) return { ok: false, erro: "Sem vídeo para publicar.", definitivo: true };
    const r = await post(`/${page}/videos`, t, { file_url: video.url, description: c.texto, title: c.titulo.slice(0, 100) });
    const id = str(obj(r.json).id); if (r.status !== 200 || !id) return falha(r);
    return { ok: true, idExterno: id, url: `https://www.facebook.com/${page}/videos/${id}` };
  }
  if (c.formato === "reels") {
    if (!video) return { ok: false, erro: "Sem vídeo para publicar.", definitivo: true };
    const ini = await post(`/${page}/video_reels`, t, { upload_phase: "start" });
    const vid = str(obj(ini.json).video_id), up = str(obj(ini.json).upload_url);
    if (ini.status !== 200 || !vid || !up) return falha(ini);
    if (!urlDaPlataformaValida(up, ["facebook.com", "fbcdn.net", "facebook.net"], Boolean(process.env.META_GRAPH_BASE))) return { ok: false, erro: "A plataforma devolveu um endereço de envio inesperado; a publicação foi interrompida por segurança.", definitivo: true };
    const envio = await chamar(up, { method: "POST", headers: { Authorization: `OAuth ${t}`, file_url: video.url } });
    if (envio.status !== 200) return falha(envio);
    const fim = await post(`/${page}/video_reels`, t, { upload_phase: "finish", video_id: vid, video_state: "PUBLISHED", description: c.texto });
    if (fim.status !== 200) return falha(fim);
    return { ok: true, idExterno: vid, url: `https://www.facebook.com/reel/${vid}` };
  }
  if (c.formato === "stories") {
    if (video || !imagens[0]) return { ok: false, erro: "Stories em vídeo no Facebook ainda não são publicados automaticamente: use a publicação assistida.", definitivo: true };
    const f = await post(`/${page}/photos`, t, { url: imagens[0].url, published: "false" });
    const fid = str(obj(f.json).id); if (f.status !== 200 || !fid) return falha(f);
    const s = await post(`/${page}/photo_stories`, t, { photo_id: fid });
    const id = str(obj(s.json).post_id) ?? str(obj(s.json).id); if (s.status !== 200 || !id) return falha(s);
    return { ok: true, idExterno: id, url: null };
  }
  return { ok: false, erro: `Formato ${c.formato} não suportado no Facebook.`, definitivo: true };
}

export const facebook: Provedor = {
  rede: "facebook", ...base("facebook", [...new Set([...ESCOPOS_FB])]),
  async trocarCodigo({ code, redirectUri }) {
    const { tokens, pagina } = await trocarCodigoMeta(code, redirectUri);
    return { tokens: { ...tokens, accessToken: pagina.token, expiraEm: null }, perfil: { contaExternaId: pagina.id, nome: pagina.nome } };
  },
  async renovar() { throw new Error("Tokens de Página do Meta não são renovados: reconecte a conta se o acesso for revogado."); },
  publicar: publicarFacebook,
  async metricasPublicacao(conta, idExterno) {
    const r = await get(`/${idExterno}`, conta.token, { fields: "reactions.summary(true).limit(0),comments.summary(true).limit(0),shares" });
    if (r.status !== 200) return null;
    const j = obj(r.json);
    const m: MetricasColetadas = {
      curtidas: num(obj(obj(j.reactions).summary).total_count), comentarios: num(obj(obj(j.comments).summary).total_count), compartilhamentos: num(obj(j.shares).count) ?? 0,
    };
    const ins = await get(`/${idExterno}/insights`, conta.token, { metric: "post_impressions_unique" });
    const alc = ins.status === 200 ? valorInsight(ins.json) : null;
    if (alc != null) m.alcance = alc;
    return m;
  },
  async metricasConta(conta) {
    if (!conta.contaExternaId) return null;
    const r = await get(`/${conta.contaExternaId}`, conta.token, { fields: "followers_count,fan_count" });
    if (r.status !== 200) return null;
    return { seguidores: num(obj(r.json).followers_count) ?? num(obj(r.json).fan_count) };
  },
};

export const _meta = { tokenInvalido };
export type { Rede };
