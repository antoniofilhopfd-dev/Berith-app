import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import http from "node:http";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";
import { execute, query, closePool } from "@/lib/db";
import { cifrar, decifrar, mascarar } from "@/lib/integracoes/cripto";
import * as C from "@/lib/integracoes/contas";
import { definirProvedores, provedor } from "@/lib/integracoes";
import type { ConteudoPublicar, ContaAtiva, Provedor } from "@/lib/integracoes/tipos";
import { facebook, instagram } from "@/lib/integracoes/meta";
import { tiktok } from "@/lib/integracoes/tiktok";
import { youtube } from "@/lib/integracoes/youtube";
import { ForbiddenError } from "@/lib/permissions";
import { DomainError } from "@/lib/services/errors";
import { equipePadrao, resetTestDb } from "./helpers";

let e: Awaited<ReturnType<typeof equipePadrao>>;

type Req = { method: string; path: string; query: Record<string, string>; body: string; headers: http.IncomingHttpHeaders };
let reqs: Req[] = [];
let rota: (r: Req) => { status?: number; json?: unknown; headers?: Record<string, string>; texto?: string } = () => ({ status: 404, json: {} });
let srv: http.Server; let base = "";

beforeAll(async () => {
  process.env.TOKEN_ENC_KEY = "chave-de-teste-para-cifrar-tokens-0123456789";
  await resetTestDb(); e = await equipePadrao();
  srv = http.createServer((rq, rs) => {
    const chunks: Buffer[] = [];
    rq.on("data", (c) => chunks.push(c));
    rq.on("end", () => {
      const u = new URL(rq.url!, base);
      const r: Req = { method: rq.method!, path: u.pathname, query: Object.fromEntries(u.searchParams), body: Buffer.concat(chunks).toString("utf8"), headers: rq.headers };
      reqs.push(r);
      const out = rota(r);
      rs.writeHead(out.status ?? 200, { "Content-Type": "application/json", ...(out.headers ?? {}) });
      rs.end(out.texto ?? JSON.stringify(out.json ?? {}));
    });
  });
  await new Promise<void>((res) => srv.listen(0, "127.0.0.1", res));
  base = `http://127.0.0.1:${(srv.address() as AddressInfo).port}`;
  Object.assign(process.env, {
    META_APP_ID: "app123", META_APP_SECRET: "segredo-meta", META_GRAPH_BASE: base, META_DIALOG_BASE: base, META_POLL_MS: "1",
    TIKTOK_CLIENT_KEY: "tk-key", TIKTOK_CLIENT_SECRET: "tk-secret", TIKTOK_API_BASE: base, TIKTOK_AUTH_BASE: base, TIKTOK_POLL_MS: "1",
    GOOGLE_CLIENT_ID: "g-id", GOOGLE_CLIENT_SECRET: "g-secret", GOOGLE_AUTH_BASE: base, GOOGLE_TOKEN_BASE: base, YOUTUBE_API_BASE: base,
  });
});
afterAll(async () => { srv.close(); await closePool(); });
beforeEach(() => { reqs = []; rota = () => ({ status: 404, json: {} }); });

const midia = (o: Partial<ConteudoPublicar["midias"][0]> = {}) => ({ id: 1, tipo: "imagem" as const, mime: "image/jpeg", nome: "a.jpg", largura: 1080, altura: 1350, tamanho: 10, url: "https://app.exemplo.org/api/midias/publica/1?exp=1&sig=s", caminhoArquivo: "/nao-usado", ...o });
const conteudo = (o: Partial<ConteudoPublicar> = {}): ConteudoPublicar => ({ publicacaoId: 1, redeId: 1, rede: "instagram", formato: "post", titulo: "Título", texto: "Legenda\n\n#fé", midias: [midia()], ...o });
const conta = (rede: ContaAtiva["rede"], extra: Partial<ContaAtiva> = {}): ContaAtiva => ({ rede, contaExternaId: "ext-1", nome: "n", token: "TOKEN-REAL", meta: {}, ...extra });
const corpo = (r: Req) => Object.fromEntries(new URLSearchParams(r.body));

describe("cifragem de tokens", () => {
  it("cifra e decifra; o texto cifrado não revela o token", () => {
    const c = cifrar("EAAB-token-secreto");
    expect(c).not.toContain("EAAB"); expect(c.startsWith("v1:")).toBe(true); expect(decifrar(c)).toBe("EAAB-token-secreto");
    expect(cifrar("EAAB-token-secreto")).not.toBe(c); // IV aleatório
  });
  it("detecta adulteração e chave errada", () => {
    const c = cifrar("x".repeat(40));
    const partes = c.split(":"); partes[3] = partes[3].slice(0, -2) + (partes[3].endsWith("AA") ? "BB" : "AA");
    expect(() => decifrar(partes.join(":"))).toThrow();
    const original = process.env.TOKEN_ENC_KEY;
    process.env.TOKEN_ENC_KEY = "outra-chave-completamente-diferente-987654321";
    expect(() => decifrar(c)).toThrow();
    process.env.TOKEN_ENC_KEY = original;
    delete process.env.TOKEN_ENC_KEY; expect(() => cifrar("a")).toThrow(/TOKEN_ENC_KEY/); process.env.TOKEN_ENC_KEY = original;
    expect(() => decifrar("lixo")).toThrow();
  });
  it("mascara tokens em mensagens", () => {
    expect(mascarar("falhou access_token=ABC123&x=1 Bearer eyJ.abc.def code=XYZ")).toBe("falhou access_token=***&x=1 Bearer *** code=***");
  });
});

describe("conexão OAuth", () => {
  const fake = (): Provedor => ({
    rede: "youtube", configurado: () => true, variaveis: () => ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"], escopos: () => ["a", "b"],
    urlAutorizacao: ({ state, redirectUri }) => `https://auth.exemplo/?state=${state}&redirect_uri=${encodeURIComponent(redirectUri)}`,
    trocarCodigo: async ({ code }) => { if (code === "ruim") throw new Error("invalid_grant code=ruim"); return { tokens: { accessToken: "ACESSO-123", refreshToken: "REFRESH-456", expiraEm: new Date(Date.now() + 3600_000), escopos: "a b" }, perfil: { contaExternaId: "canal-1", nome: "Canal Nova Berith" } }; },
    renovar: async () => ({ accessToken: "x" }), publicar: async () => ({ ok: true, idExterno: "1" }), metricasPublicacao: async () => null, metricasConta: async () => null,
  });
  const estadoDe = async (url: string) => new URL(url).searchParams.get("state")!;

  it("só o administrador conecta; o app precisa estar configurado e haver chave de cifra", async () => {
    definirProvedores({ youtube: fake() });
    await expect(C.iniciarConexao(e.coord, "youtube", "https://app.exemplo.org")).rejects.toBeInstanceOf(ForbiddenError);
    definirProvedores({ youtube: { ...fake(), configurado: () => false } });
    await expect(C.iniciarConexao(e.admin, "youtube", "https://app.exemplo.org")).rejects.toThrow(/GOOGLE_CLIENT_ID/);
    definirProvedores({ youtube: fake() });
    const k = process.env.TOKEN_ENC_KEY; delete process.env.TOKEN_ENC_KEY;
    await expect(C.iniciarConexao(e.admin, "youtube", "https://app.exemplo.org")).rejects.toThrow(/TOKEN_ENC_KEY/);
    process.env.TOKEN_ENC_KEY = k;
  });
  it("Instagram com várias contas: extras só leem métricas, tokens cifrados, removem com seus dados", async () => {
    const prov = (principal: string, extras: string[]): Provedor => ({ ...fake(), rede: "instagram", trocarCodigo: async () => ({
      tokens: { accessToken: `TOK-${principal}` },
      perfil: { contaExternaId: principal, nome: `@${principal}`, extras: extras.map((x) => ({ contaExternaId: x, nome: `@${x}`, token: `PAGE-${x}`, meta: { pageId: `pg-${x}` } })) },
    }) });
    const conectar = async (principal: string, extras: string[]) => {
      definirProvedores({ instagram: prov(principal, extras) });
      const st = await estadoDe(await C.iniciarConexao(e.admin, "instagram", "https://app.exemplo.org"));
      await C.concluirConexao(e.admin, "instagram", st, "c", "https://app.exemplo.org");
    };
    await conectar("111", ["222", "333"]);
    expect((await C.contasInstagram()).map((c) => [c.igId, c.principal])).toEqual([["111", true], ["222", false], ["333", false]]);
    const linha = (await query<any>("SELECT token_enc FROM instagram_contas WHERE ig_id = '222'"))[0];
    expect(linha.token_enc).not.toContain("PAGE-222"); expect(decifrar(linha.token_enc)).toBe("PAGE-222");
    const ativas = await C.contasInstagramAtivas();
    expect(ativas.map((c) => [c.igId, c.conta.token])).toEqual([["111", "TOK-111"], ["222", "PAGE-222"], ["333", "PAGE-333"]]);
    expect(JSON.stringify(await C.statusRedes(e.coord))).not.toMatch(/PAGE-222|TOK-111/); // a tela nunca recebe tokens
    // dados por conta e remoção
    await execute("INSERT INTO posts_externos (rede, conta_id, id_externo, publicado_em, coletado_em) VALUES ('instagram','222','p1', NOW(), NOW()), ('instagram','111','p2', NOW(), NOW())");
    await execute("INSERT INTO instagram_mensal (conta_id, periodo, atualizado_em) VALUES ('222','2026-10', NOW())");
    await expect(C.removerContaInstagram(e.coord, "222")).rejects.toBeInstanceOf(ForbiddenError);
    await expect(C.removerContaInstagram(e.admin, "111")).rejects.toThrow(/principal/); // a principal sai por “Desconectar”
    await C.removerContaInstagram(e.admin, "222");
    expect((await C.contasInstagram()).map((c) => c.igId)).toEqual(["111", "333"]);
    expect((await query<any>("SELECT conta_id FROM posts_externos")).map((r: any) => r.conta_id)).toEqual(["111"]);
    expect((await query<any>("SELECT COUNT(*) n FROM instagram_mensal"))[0].n).toBe(0);
    // trocar a principal para uma conta que era extra: ela deixa de ser extra
    await conectar("333", ["111"]);
    expect((await C.contasInstagram()).map((c) => [c.igId, c.principal])).toEqual([["333", true], ["111", false]]);
    // desconectar apaga os tokens das extras (os dados importados ficam)
    await C.desconectar(e.admin, "instagram");
    expect((await query<any>("SELECT COUNT(*) n FROM instagram_contas"))[0].n).toBe(0);
    expect((await query<any>("SELECT COUNT(*) n FROM posts_externos"))[0].n).toBe(1);
    await execute("DELETE FROM redes_contas WHERE rede = 'instagram'");
    await execute("DELETE FROM posts_externos");
    definirProvedores({ youtube: fake() });
  });
  it("fluxo completo: state de uso único, tokens cifrados no banco, status e desconexão", async () => {
    definirProvedores({ youtube: fake() });
    const url = await C.iniciarConexao(e.admin, "youtube", "https://app.exemplo.org/");
    expect(url).toContain(encodeURIComponent("https://app.exemplo.org/api/integracoes/youtube/callback"));
    const state = await estadoDe(url);
    expect((await query<any>("SELECT state_hash FROM oauth_estados"))[0].state_hash).not.toBe(state); // só o hash fica salvo
    const r = await C.concluirConexao(e.admin, "youtube", state, "codigo-ok", "https://app.exemplo.org");
    expect(r.nome).toBe("Canal Nova Berith");
    const linha = (await query<any>("SELECT * FROM redes_contas WHERE rede = 'youtube'"))[0];
    expect(linha.token_enc).not.toContain("ACESSO-123"); expect(linha.refresh_enc).not.toContain("REFRESH-456");
    expect(decifrar(linha.token_enc)).toBe("ACESSO-123"); expect(decifrar(linha.refresh_enc)).toBe("REFRESH-456");
    await expect(C.concluirConexao(e.admin, "youtube", state, "codigo-ok", "https://app.exemplo.org")).rejects.toThrow(/inválido ou expirado/); // reuso
    const st = (await C.statusRedes(e.coord)).find((s) => s.rede === "youtube")!;
    expect(st.estado).toBe("conectada"); expect(st.conta?.nome).toBe("Canal Nova Berith");
    expect(JSON.stringify(st)).not.toMatch(/ACESSO-123|REFRESH-456/); // a tela nunca recebe o token
    await expect(C.statusRedes(e.integ)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(C.desconectar(e.coord, "youtube")).rejects.toBeInstanceOf(ForbiddenError);
    await C.desconectar(e.admin, "youtube");
    expect((await C.statusRedes(e.admin)).find((s) => s.rede === "youtube")!.estado).toBe("nao_conectada");
    expect((await query<any>("SELECT token_enc, refresh_enc FROM redes_contas WHERE rede='youtube'"))[0]).toEqual({ token_enc: "", refresh_enc: null });
    expect(await C.contaAtiva("youtube")).toMatchObject({ reconectar: true });
  });
  it("rejeita state forjado, expirado, de outra rede ou de outra pessoa", async () => {
    definirProvedores({ youtube: fake(), facebook: { ...fake(), rede: "facebook" } });
    await expect(C.concluirConexao(e.admin, "youtube", "inventado", "c", "https://x.org")).rejects.toThrow(/inválido ou expirado/);
    const adm2 = e.admin;
    const s1 = await estadoDe(await C.iniciarConexao(adm2, "youtube", "https://x.org"));
    await expect(C.concluirConexao(adm2, "facebook", s1, "c", "https://x.org")).rejects.toThrow(/inválido ou expirado/); // rede trocada
    const s2 = await estadoDe(await C.iniciarConexao(adm2, "youtube", "https://x.org"));
    await execute("UPDATE oauth_estados SET expira_em = DATE_SUB(UTC_TIMESTAMP(), INTERVAL 1 MINUTE)");
    await expect(C.concluirConexao(adm2, "youtube", s2, "c", "https://x.org")).rejects.toThrow(/inválido ou expirado/); // expirado
  });
  it("erro da plataforma na troca do código vira mensagem segura e log sem segredo", async () => {
    definirProvedores({ youtube: fake() });
    const s = await estadoDe(await C.iniciarConexao(e.admin, "youtube", "https://x.org"));
    await expect(C.concluirConexao(e.admin, "youtube", s, "ruim", "https://x.org")).rejects.toThrow(/Não foi possível conectar/);
    const logs = await C.logs(e.admin);
    expect(JSON.stringify(logs)).not.toContain("code=ruim"); expect(logs.some((l) => l.evento === "conexao_falhou")).toBe(true);
    definirProvedores(null);
  });
  it("status 'app_nao_configurado' orienta quais variáveis definir", async () => {
    const antes = process.env.TIKTOK_CLIENT_KEY; delete process.env.TIKTOK_CLIENT_KEY;
    const st = (await C.statusRedes(e.admin)).find((s) => s.rede === "tiktok")!;
    expect(st.estado).toBe("app_nao_configurado"); expect(st.variaveis).toEqual(["TIKTOK_CLIENT_KEY", "TIKTOK_CLIENT_SECRET"]);
    process.env.TIKTOK_CLIENT_KEY = antes;
  });
});

const contaMeta = (async () => {
  rota = (r) => {
    if (r.path.endsWith("/oauth/access_token") && r.query.code) return { json: { access_token: "CURTO" } };
    if (r.path.endsWith("/oauth/access_token") && r.query.grant_type === "fb_exchange_token") return { json: { access_token: "LONGO", expires_in: 5184000 } };
    if (r.path.endsWith("/me/accounts")) return { json: { data: [{ id: "pg1", name: "Sem IG", access_token: "TP1" }, { id: "pg2", name: "Nova Berith", access_token: "TP2", instagram_business_account: { id: "ig9" } }] } };
    if (r.path.endsWith("/ig9")) return { json: { username: "novaberith" } };
    return { status: 404 };
  };
});

describe("Meta — autorização", () => {
  it("monta a URL de autorização com state e escopos de publicação", () => {
    const u = new URL(instagram.urlAutorizacao({ state: "ST", redirectUri: "https://app/cb" }));
    expect(u.searchParams.get("state")).toBe("ST"); expect(u.searchParams.get("client_id")).toBe("app123");
    expect(u.searchParams.get("scope")).toContain("instagram_content_publish"); expect(u.searchParams.get("client_secret")).toBeNull();
    expect(new URL(facebook.urlAutorizacao({ state: "S", redirectUri: "https://app/cb" })).searchParams.get("scope")).toContain("pages_manage_posts");
  });
  it("Instagram: usa a página que tem conta profissional e o token da página (longa duração)", async () => {
    contaMeta();
    const r = await instagram.trocarCodigo({ code: "CODE", redirectUri: "https://app/cb" });
    expect(r.perfil).toMatchObject({ contaExternaId: "ig9", nome: "@novaberith", meta: { pageId: "pg2" } });
    expect(r.tokens.accessToken).toBe("TP2");
    const troca = reqs.find((q) => q.query.grant_type === "fb_exchange_token")!;
    expect(troca.query.fb_exchange_token).toBe("CURTO"); expect(troca.query.client_secret).toBe("segredo-meta");
  });
  it("Instagram: outras Páginas do mesmo login com Instagram viram contas extras (só leitura)", async () => {
    rota = (r) => {
      if (r.path.endsWith("/oauth/access_token") && r.query.code) return { json: { access_token: "CURTO" } };
      if (r.path.endsWith("/oauth/access_token")) return { json: { access_token: "LONGO" } };
      if (r.path.endsWith("/me/accounts")) return { json: { data: [
        { id: "pgA", name: "A", access_token: "TA", instagram_business_account: { id: "igA", username: "conta_a" } },
        { id: "pgB", name: "B", access_token: "TB", instagram_business_account: { id: "igB", username: "conta_b" } },
        { id: "pgC", name: "Sem IG", access_token: "TC" },
      ] } };
      if (r.path.endsWith("/igA")) return { json: { username: "conta_a" } };
      return { status: 404 };
    };
    const r = await instagram.trocarCodigo({ code: "C", redirectUri: "https://app/cb" });
    expect(r.perfil.contaExternaId).toBe("igA");
    expect(r.perfil.extras).toEqual([{ contaExternaId: "igB", nome: "@conta_b", token: "TB", meta: { pageId: "pgB" } }]);
  });
  it("Facebook: usa a primeira Página; META_PAGE_ID escolhe outra", async () => {
    contaMeta();
    expect((await facebook.trocarCodigo({ code: "C", redirectUri: "https://app/cb" })).perfil.contaExternaId).toBe("pg1");
    process.env.META_PAGE_ID = "pg2";
    expect((await facebook.trocarCodigo({ code: "C", redirectUri: "https://app/cb" })).perfil.contaExternaId).toBe("pg2");
    process.env.META_PAGE_ID = "nao-existe";
    await expect(facebook.trocarCodigo({ code: "C", redirectUri: "https://app/cb" })).rejects.toThrow(/Nenhuma Página/);
    delete process.env.META_PAGE_ID;
  });
  it("erro de autorização vira mensagem sem segredos", async () => {
    rota = () => ({ status: 400, json: { error: { message: "Invalid verification code access_token=XYZ", code: 100 } } });
    await expect(facebook.trocarCodigo({ code: "x", redirectUri: "https://app/cb" })).rejects.toThrow(/HTTP 400/);
    await facebook.trocarCodigo({ code: "x", redirectUri: "https://app/cb" }).catch((err) => expect(String(err.message)).not.toContain("XYZ"));
  });
});

describe("Instagram — posts da conta inteira", () => {
  const ig = conta("instagram", { contaExternaId: "ig9" });
  it("lista os posts recentes com métricas e para na data de corte", async () => {
    rota = (r) => {
      if (r.path.endsWith("/ig9/media")) return { json: { data: [
        { id: "p1", caption: "Novo", media_type: "VIDEO", media_product_type: "REELS", permalink: "https://www.instagram.com/reel/1/", timestamp: "2026-10-15T12:00:00+0000", like_count: 40, comments_count: 3 },
        { id: "p2", caption: "Velho", media_type: "IMAGE", permalink: "https://www.instagram.com/p/2/", timestamp: "2026-01-01T12:00:00+0000", like_count: 1, comments_count: 0 },
      ], paging: { next: `${base}/proxima` } } };
      if (r.path.endsWith("/p1/insights")) return r.query.metric === "saved" ? { json: { data: [{ values: [{ value: 7 }] }] } } : r.query.metric === "reach" ? { json: { data: [{ values: [{ value: 800 }] }] } } : { status: 400, json: { error: { message: "métrica indisponível" } } };
      return { status: 404, json: {} };
    };
    const posts = await instagram.listarPostsConta!(ig, new Date("2026-07-01T00:00:00Z"), 50);
    expect(posts).toHaveLength(1);
    expect(posts[0]).toMatchObject({ idExterno: "p1", tipo: "REELS", url: "https://www.instagram.com/reel/1/", curtidas: 40, comentarios: 3, alcance: 800, salvamentos: 7 });
    expect(posts[0].visualizacoes).toBeUndefined(); // a rede não informou → nada inventado
    expect(reqs.some((q) => q.path === "/proxima")).toBe(false); // parou no post antigo
    expect(reqs[0].query.access_token).toBe("TOKEN-REAL");
  });
  it("segue a paginação e erro da plataforma vira exceção sem vazar o token", async () => {
    rota = (r) => (r.path.endsWith("/ig9/media") ? { json: { data: [{ id: "a", timestamp: "2026-10-15T12:00:00+0000", like_count: 1, comments_count: 0 }], paging: { next: `${base}/proxima` } } } : r.path === "/proxima" ? { json: { data: [{ id: "b", timestamp: "2026-10-14T12:00:00+0000", like_count: 2, comments_count: 0 }] } } : { status: 400, json: {} });
    expect((await instagram.listarPostsConta!(ig, new Date("2026-07-01T00:00:00Z"), 50)).map((p) => p.idExterno)).toEqual(["a", "b"]);
    rota = () => ({ status: 400, json: { error: { message: "Token TOKEN-REAL inválido" } } });
    await expect(instagram.listarPostsConta!(ig, new Date("2026-07-01T00:00:00Z"), 50)).rejects.toThrow(/HTTP 400/);
  });
  it("métricas da conta trazem alcance e visualizações do dia quando a rede informa", async () => {
    rota = (r) => (r.path.endsWith("/ig9") ? { json: { followers_count: 500 } } : r.query.metric === "reach" ? { json: { data: [{ total_value: { value: 3000 } }] } } : { status: 400, json: {} });
    expect(await instagram.metricasConta(ig)).toEqual({ seguidores: 500, alcance: 3000 });
  });
});

describe("Instagram — métricas do mês", () => {
  const ig = conta("instagram", { contaExternaId: "ig9" });
  const dia = (iso: string) => Math.floor(new Date(iso).getTime() / 1000);
  it("mês de 30 dias vai numa janela; usa o fuso do ministério e lê os totais", async () => {
    rota = (r) => (r.path.endsWith("/ig9/insights") ? { json: { data: [
      { name: "reach", total_value: { value: 1000 } }, { name: "views", total_value: { value: 4000 } }, { name: "profile_views", total_value: { value: 70 } },
      { name: "total_interactions", total_value: { value: 300 } }, { name: "likes", total_value: { value: 200 } }, { name: "saves", total_value: { value: 20 } },
    ] } } : { status: 404 });
    const m = await instagram.metricasMes!(ig, 2026, 9, new Date("2026-10-19T12:00:00Z"));
    expect(m).toEqual({ alcance: 1000, visualizacoes: 4000, visitasPerfil: 70, interacoes: 300, curtidas: 200, salvamentos: 20 });
    expect(reqs).toHaveLength(1);
    expect(reqs[0].query).toMatchObject({ metric_type: "total_value", period: "day", since: String(dia("2026-09-01T03:00:00Z")), until: String(dia("2026-10-01T03:00:00Z")) });
    expect(reqs[0].query.metric).toBe("reach,views,profile_views,total_interactions,likes,comments,shares,saves");
  });
  it("mês de 31 dias vai em duas janelas somadas; mês corrente para em 'agora'", async () => {
    rota = () => ({ json: { data: [{ name: "reach", total_value: { value: 10 } }] } });
    expect((await instagram.metricasMes!(ig, 2026, 8, new Date("2026-10-19T12:00:00Z")))?.alcance).toBe(20); // 2 janelas × 10
    expect(reqs).toHaveLength(2);
    reqs = [];
    await instagram.metricasMes!(ig, 2026, 10, new Date("2026-10-19T12:00:00Z"));
    expect(reqs).toHaveLength(1); expect(Number(reqs[0].query.until)).toBe(dia("2026-10-19T12:00:00Z"));
    expect(await instagram.metricasMes!(ig, 2026, 11, new Date("2026-10-19T12:00:00Z"))).toBeNull(); // mês futuro
  });
  it("se a Meta recusa o lote, tenta métrica a métrica; se recusa tudo, lança o erro dela", async () => {
    rota = (r) => (r.query.metric.includes(",") ? { status: 400, json: { error: { message: "metric views não existe" } } } : r.query.metric === "reach" ? { json: { data: [{ name: "reach", total_value: { value: 5 } }] } } : { status: 400, json: { error: { message: "indisponível" } } });
    expect(await instagram.metricasMes!(ig, 2026, 9, new Date("2026-10-19T12:00:00Z"))).toEqual({ alcance: 5 });
    rota = () => ({ status: 400, json: { error: { message: "(#10) Permissão ausente" } } });
    await expect(instagram.metricasMes!(ig, 2026, 9, new Date("2026-10-19T12:00:00Z"))).rejects.toThrow(/Permissão ausente/);
  });
});

describe("Instagram — publicação", () => {
  const ig = conta("instagram", { contaExternaId: "ig9" });
  const ok = (r: Req) => {
    if (r.method === "POST" && r.path.endsWith("/ig9/media")) return { json: { id: `c${reqs.filter((x) => x.path.endsWith("/ig9/media")).length}` } };
    if (r.method === "POST" && r.path.endsWith("/ig9/media_publish")) return { json: { id: "m77" } };
    if (r.method === "GET" && /\/c\d+$/.test(r.path)) return { json: { status_code: "FINISHED" } };
    if (r.method === "GET" && r.path.endsWith("/m77")) return { json: { permalink: "https://www.instagram.com/p/XYZ/" } };
    return { status: 404, json: { error: { message: "rota inesperada" } } };
  };
  it("post de imagem: cria o container com image_url + legenda e publica", async () => {
    rota = ok;
    const r = await instagram.publicar(ig, conteudo());
    expect(r).toEqual({ ok: true, idExterno: "m77", url: "https://www.instagram.com/p/XYZ/" });
    const criar = reqs.find((q) => q.path.endsWith("/ig9/media"))!;
    expect(corpo(criar)).toMatchObject({ image_url: midia().url, caption: "Legenda\n\n#fé", access_token: "TOKEN-REAL" });
    expect(corpo(reqs.find((q) => q.path.endsWith("/media_publish"))!)).toMatchObject({ creation_id: "c1" });
  });
  it("carrossel: cria os itens, o container de carrossel e publica", async () => {
    rota = ok;
    const r = await instagram.publicar(ig, conteudo({ formato: "carrossel", midias: [midia({ id: 1 }), midia({ id: 2, url: "https://x/2" }), midia({ id: 3, tipo: "video", mime: "video/mp4", url: "https://x/3.mp4" })] }));
    expect(r.ok).toBe(true);
    const medias = reqs.filter((q) => q.method === "POST" && q.path.endsWith("/ig9/media")).map(corpo);
    expect(medias.slice(0, 3).every((m) => m.is_carousel_item === "true")).toBe(true);
    expect(medias[2]).toMatchObject({ media_type: "VIDEO", video_url: "https://x/3.mp4" });
    expect(medias[3]).toMatchObject({ media_type: "CAROUSEL", children: "c1,c2,c3", caption: "Legenda\n\n#fé" });
  });
  it("reels: aguarda o processamento do vídeo antes de publicar", async () => {
    let consultas = 0;
    rota = (r) => { if (r.method === "GET" && /\/c1$/.test(r.path)) { consultas++; return { json: { status_code: consultas < 3 ? "IN_PROGRESS" : "FINISHED" } }; } return ok(r); };
    const r = await instagram.publicar(ig, conteudo({ formato: "reels", midias: [midia({ tipo: "video", mime: "video/mp4", url: "https://x/v.mp4" })] }));
    expect(r.ok).toBe(true); expect(consultas).toBe(3);
    expect(corpo(reqs.find((q) => q.path.endsWith("/ig9/media"))!)).toMatchObject({ media_type: "REELS", video_url: "https://x/v.mp4" });
  });
  it("stories: sem legenda", async () => {
    rota = ok;
    await instagram.publicar(ig, conteudo({ formato: "stories" }));
    const c = corpo(reqs.find((q) => q.path.endsWith("/ig9/media"))!);
    expect(c.media_type).toBe("STORIES"); expect(c.caption).toBeUndefined();
  });
  it("vídeo recusado pelo Instagram: erro definitivo com motivo", async () => {
    rota = (r) => (r.method === "GET" && /\/c1$/.test(r.path) ? { json: { status_code: "ERROR", status: "formato inválido" } } : ok(r));
    const r = await instagram.publicar(ig, conteudo({ formato: "reels", midias: [midia({ tipo: "video", mime: "video/mp4" })] }));
    expect(r).toMatchObject({ ok: false, definitivo: true }); expect(JSON.stringify(r)).toMatch(/formato inválido/);
  });
  it("token inválido (code 190) pede reconexão; erro 5xx não é definitivo", async () => {
    rota = () => ({ status: 400, json: { error: { message: "Token expirado", code: 190, type: "OAuthException" } } });
    expect(await instagram.publicar(ig, conteudo())).toMatchObject({ ok: false, reconectar: true, httpStatus: 400 });
    rota = () => ({ status: 503, json: { error: { message: "indisponível" } } });
    const r = await instagram.publicar(ig, conteudo());
    expect(r).toMatchObject({ ok: false, httpStatus: 503 }); expect((r as { definitivo?: boolean }).definitivo).toBeFalsy();
  });
  it("sem conta do Instagram no cadastro: pede reconexão", async () => {
    expect(await instagram.publicar(conta("instagram", { contaExternaId: null }), conteudo())).toMatchObject({ ok: false, reconectar: true });
  });
  it("coleta métricas sem inventar o que não vem", async () => {
    rota = (r) => {
      const m = r.query.metric;
      if (m === "reach") return { json: { data: [{ name: "reach", values: [{ value: 321 }] }] } };
      if (m === "likes") return { json: { data: [{ name: "likes", total_value: { value: 40 } }] } };
      if (m === "saved") return { status: 400, json: { error: { message: "metric not supported" } } };
      return { json: { data: [] } };
    };
    expect(await instagram.metricasPublicacao(ig, "m77", "post")).toEqual({ alcance: 321, curtidas: 40 });
    rota = () => ({ status: 400, json: {} });
    expect(await instagram.metricasPublicacao(ig, "m77", "post")).toBeNull();
  });
});

describe("Facebook — publicação", () => {
  const fb = conta("facebook", { contaExternaId: "pg2" });
  it("texto puro vai para /feed; uma foto vai para /photos", async () => {
    rota = (r) => (r.path.endsWith("/pg2/feed") ? { json: { id: "pg2_1" } } : r.path.endsWith("/pg2/photos") ? { json: { id: "ph1", post_id: "pg2_2" } } : { json: { permalink_url: "/pg2/posts/1" } });
    expect(await facebook.publicar(fb, conteudo({ rede: "facebook", midias: [] }))).toMatchObject({ ok: true, idExterno: "pg2_1", url: "https://www.facebook.com/pg2/posts/1" });
    expect(corpo(reqs.find((q) => q.path.endsWith("/feed"))!).message).toBe("Legenda\n\n#fé");
    reqs = [];
    expect(await facebook.publicar(fb, conteudo({ rede: "facebook" }))).toMatchObject({ ok: true, idExterno: "pg2_2" });
    expect(corpo(reqs.find((q) => q.path.endsWith("/photos"))!)).toMatchObject({ url: midia().url, caption: "Legenda\n\n#fé", published: "true" });
  });
  it("várias fotos: envia sem publicar e anexa todas em um único post", async () => {
    let n = 0;
    rota = (r) => (r.path.endsWith("/photos") ? { json: { id: `f${++n}` } } : r.path.endsWith("/feed") ? { json: { id: "pg2_9" } } : { json: {} });
    const r = await facebook.publicar(fb, conteudo({ rede: "facebook", formato: "carrossel", midias: [midia({ id: 1 }), midia({ id: 2, url: "https://x/2" })] }));
    expect(r).toMatchObject({ ok: true, idExterno: "pg2_9" });
    const feed = corpo(reqs.find((q) => q.path.endsWith("/feed"))!);
    expect(JSON.parse(feed["attached_media[0]"])).toEqual({ media_fbid: "f1" }); expect(JSON.parse(feed["attached_media[1]"])).toEqual({ media_fbid: "f2" });
    expect(reqs.filter((q) => q.path.endsWith("/photos")).every((q) => corpo(q).published === "false")).toBe(true);
  });
  it("vídeo usa file_url; Reels usa as três fases", async () => {
    rota = (r) => (r.path.endsWith("/pg2/videos") ? { json: { id: "v1" } } : { json: {} });
    const v = midia({ tipo: "video", mime: "video/mp4", url: "https://x/v.mp4" });
    expect(await facebook.publicar(fb, conteudo({ rede: "facebook", formato: "video", midias: [v] }))).toMatchObject({ ok: true, idExterno: "v1" });
    expect(corpo(reqs[0])).toMatchObject({ file_url: "https://x/v.mp4", description: "Legenda\n\n#fé", title: "Título" });
    reqs = [];
    rota = (r) => {
      if (r.path.endsWith("/video_reels") && corpo(r).upload_phase === "start") return { json: { video_id: "rl1", upload_url: `${base}/upload/rl1` } };
      if (r.path === "/upload/rl1") return { json: { success: true } };
      if (r.path.endsWith("/video_reels")) return { json: { success: true } };
      return { json: {} };
    };
    expect(await facebook.publicar(fb, conteudo({ rede: "facebook", formato: "reels", midias: [v] }))).toMatchObject({ ok: true, idExterno: "rl1" });
    const up = reqs.find((q) => q.path === "/upload/rl1")!;
    expect(up.headers.file_url).toBe("https://x/v.mp4"); expect(up.headers.authorization).toBe("OAuth TOKEN-REAL");
    expect(corpo(reqs.at(-1)!)).toMatchObject({ upload_phase: "finish", video_id: "rl1", video_state: "PUBLISHED" });
  });
  it("stories em vídeo ainda não é automático: orienta a publicação assistida", async () => {
    const r = await facebook.publicar(fb, conteudo({ rede: "facebook", formato: "stories", midias: [midia({ tipo: "video", mime: "video/mp4" })] }));
    expect(r).toMatchObject({ ok: false, definitivo: true }); expect(JSON.stringify(r)).toMatch(/assistida/);
  });
  it("coleta curtidas, comentários e compartilhamentos", async () => {
    rota = (r) => (r.path.endsWith("/insights") ? { json: { data: [{ values: [{ value: 900 }] }] } } : { json: { reactions: { summary: { total_count: 12 } }, comments: { summary: { total_count: 3 } }, shares: { count: 2 } } });
    expect(await facebook.metricasPublicacao(fb, "pg2_1", "post")).toEqual({ curtidas: 12, comentarios: 3, compartilhamentos: 2, alcance: 900 });
  });
});

describe("TikTok — publicação", () => {
  const tk = conta("tiktok");
  const video = midia({ tipo: "video", mime: "video/mp4", url: "https://x/v.mp4" });
  it("troca o código por tokens (formulário) e lê o perfil", async () => {
    rota = (r) => (r.path === "/v2/oauth/token/" ? { json: { access_token: "TK-A", refresh_token: "TK-R", expires_in: 86400, open_id: "open1", scope: "video.publish" } } : { json: { data: { user: { display_name: "Nova Berith" } } } });
    const r = await tiktok.trocarCodigo({ code: "C", redirectUri: "https://app/cb" });
    expect(r.tokens).toMatchObject({ accessToken: "TK-A", refreshToken: "TK-R" }); expect(r.perfil).toMatchObject({ contaExternaId: "open1", nome: "Nova Berith" });
    expect(corpo(reqs[0])).toMatchObject({ client_key: "tk-key", client_secret: "tk-secret", grant_type: "authorization_code" });
    expect(new URL(tiktok.urlAutorizacao({ state: "S", redirectUri: "https://app/cb" })).searchParams.get("scope")).toContain("video.publish");
  });
  it("publica por URL, respeita a privacidade permitida e aguarda a conclusão", async () => {
    let status = 0;
    rota = (r) => {
      if (r.path.endsWith("/creator_info/query/")) return { json: { data: { privacy_level_options: ["SELF_ONLY"] }, error: { code: "ok" } } };
      if (r.path.endsWith("/video/init/")) return { json: { data: { publish_id: "pub1" }, error: { code: "ok" } } };
      if (r.path.endsWith("/status/fetch/")) return { json: { data: { status: ++status < 2 ? "PROCESSING_DOWNLOAD" : "PUBLISH_COMPLETE", publicaly_available_post_id: ["7000"] } } };
      return { status: 404 };
    };
    const r = await tiktok.publicar(tk, conteudo({ rede: "tiktok", formato: "video", midias: [video] }));
    expect(r).toMatchObject({ ok: true, idExterno: "7000" });
    const init = JSON.parse(reqs.find((q) => q.path.endsWith("/video/init/"))!.body);
    expect(init.post_info.privacy_level).toBe("SELF_ONLY"); // app sem auditoria: só privado
    expect(init.source_info).toEqual({ source: "PULL_FROM_URL", video_url: "https://x/v.mp4" });
    expect(reqs[0].headers.authorization).toBe("Bearer TOKEN-REAL");
  });
  it("falha de processamento informa o motivo; sem vídeo é erro definitivo", async () => {
    rota = (r) => (r.path.endsWith("/creator_info/query/") ? { json: { data: { privacy_level_options: ["PUBLIC_TO_EVERYONE"] } } } : r.path.endsWith("/video/init/") ? { json: { data: { publish_id: "p2" }, error: { code: "ok" } } } : { json: { data: { status: "FAILED", fail_reason: "video_pull_failed" } } });
    const r = await tiktok.publicar(tk, conteudo({ rede: "tiktok", formato: "video", midias: [video] }));
    expect(r).toMatchObject({ ok: false, definitivo: true }); expect(JSON.stringify(r)).toMatch(/video_pull_failed/);
    expect(await tiktok.publicar(tk, conteudo({ rede: "tiktok", formato: "video", midias: [] }))).toMatchObject({ ok: false, definitivo: true });
  });
  it("erro 401 pede reconexão; renovar exige refresh token", async () => {
    rota = () => ({ status: 401, json: { error: { code: "access_token_invalid", message: "token inválido" } } });
    expect(await tiktok.publicar(tk, conteudo({ rede: "tiktok", formato: "video", midias: [video] }))).toMatchObject({ ok: false, reconectar: true });
    await expect(tiktok.renovar({ refreshToken: null, token: "x", meta: {} })).rejects.toThrow(/reconecte/i);
    rota = () => ({ json: { access_token: "NOVO", refresh_token: "R2", expires_in: 100 } });
    expect(await tiktok.renovar({ refreshToken: "R1", token: "x", meta: {} })).toMatchObject({ accessToken: "NOVO", refreshToken: "R2" });
    expect(corpo(reqs.at(-1)!)).toMatchObject({ grant_type: "refresh_token", refresh_token: "R1" });
  });
  it("métricas do vídeo e seguidores", async () => {
    rota = (r) => (r.path.includes("/video/query/") ? { json: { data: { videos: [{ id: "7000", view_count: 500, like_count: 50, comment_count: 5, share_count: 1 }] } } } : { json: { data: { user: { follower_count: 321 } } } });
    expect(await tiktok.metricasPublicacao(tk, "7000", "video")).toEqual({ visualizacoes: 500, curtidas: 50, comentarios: 5, compartilhamentos: 1 });
    expect(await tiktok.metricasConta(tk)).toEqual({ seguidores: 321 });
  });
});

describe("YouTube — publicação", () => {
  const yt = conta("youtube");
  it("autoriza com acesso offline e renova usando o refresh token", async () => {
    const u = new URL(youtube.urlAutorizacao({ state: "S", redirectUri: "https://app/cb" }));
    expect(u.searchParams.get("access_type")).toBe("offline"); expect(u.searchParams.get("scope")).toContain("youtube.upload");
    rota = () => ({ json: { access_token: "NOVO-YT", expires_in: 3599 } });
    const t = await youtube.renovar({ refreshToken: "REF", token: "x", meta: {} });
    expect(t).toMatchObject({ accessToken: "NOVO-YT", refreshToken: "REF" });
  });
  it("upload resumível: metadados primeiro, depois o arquivo do disco", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "nb-yt-")); const arq = path.join(dir, "v.mp4"); const bytes = Buffer.alloc(5000, 7);
    await writeFile(arq, bytes);
    rota = (r) => {
      if (r.path === "/upload/youtube/v3/videos") return { headers: { Location: `${base}/upload-destino/1` }, json: {} };
      if (r.path === "/upload-destino/1") return { json: { id: "yt123" } };
      return { status: 404 };
    };
    const r = await youtube.publicar(yt, conteudo({ rede: "youtube", formato: "short", titulo: "x".repeat(150), midias: [midia({ tipo: "video", mime: "video/mp4", tamanho: bytes.length, caminhoArquivo: arq })] }));
    expect(r).toEqual({ ok: true, idExterno: "yt123", url: "https://www.youtube.com/watch?v=yt123" });
    const meta = JSON.parse(reqs[0].body);
    expect(meta.snippet.title).toHaveLength(100); expect(meta.snippet.description).toMatch(/#Shorts$/); expect(meta.status.privacyStatus).toBe("public");
    expect(reqs[0].headers.authorization).toBe("Bearer TOKEN-REAL"); expect(reqs[0].headers["x-upload-content-length"]).toBe("5000");
    expect(reqs[1].method).toBe("PUT"); expect(reqs[1].body.length).toBe(5000);
  });
  it("cota excedida (429) pode ser repetida; 403 de permissão é definitivo", async () => {
    rota = () => ({ status: 429, json: { error: { message: "quotaExceeded" } } });
    const v = midia({ tipo: "video", mime: "video/mp4" });
    const a = await youtube.publicar(yt, conteudo({ rede: "youtube", formato: "video", midias: [v] }));
    expect(a).toMatchObject({ ok: false, httpStatus: 429 }); expect((a as { definitivo?: boolean }).definitivo).toBeFalsy();
    rota = () => ({ status: 403, json: { error: { message: "forbidden" } } });
    expect(await youtube.publicar(yt, conteudo({ rede: "youtube", formato: "video", midias: [v] }))).toMatchObject({ ok: false, definitivo: true });
  });
  it("estatísticas do vídeo e do canal", async () => {
    rota = (r) => (r.path.endsWith("/videos") ? { json: { items: [{ statistics: { viewCount: "1500", likeCount: "90", commentCount: "7" } }] } } : { json: { items: [{ statistics: { subscriberCount: "800", viewCount: "9000" } }] } });
    expect(await youtube.metricasPublicacao(yt, "yt123", "video")).toEqual({ visualizacoes: 1500, curtidas: 90, comentarios: 7 });
    expect(await youtube.metricasConta(yt)).toEqual({ seguidores: 800, visualizacoes: 9000 });
  });
});

describe("defesa contra SSRF em URLs devolvidas pela plataforma", () => {
  it("aceita só HTTPS em domínio da plataforma, sem credenciais embutidas", async () => {
    const { urlDaPlataformaValida: ok } = await import("@/lib/integracoes/http");
    expect(ok("https://rupload.facebook.com/x", ["facebook.com"], false)).toBe(true);
    for (const u of ["http://rupload.facebook.com/x", "https://facebook.com.evil.example/x", "https://evil.example/facebook.com", "https://user:pw@rupload.facebook.com/x", "https://169.254.169.254/latest", "file:///etc/passwd", "lixo"]) expect(ok(u, ["facebook.com"], false), u).toBe(false);
    expect(ok("http://127.0.0.1:9/x", ["facebook.com"], true)).toBe(true); // base redefinida (homologação)
  });
});

describe("registro de provedores", () => {
  it("cada rede tem seu provedor e declara as variáveis exigidas", () => {
    definirProvedores(null);
    expect(provedor("instagram").variaveis()).toEqual(["META_APP_ID", "META_APP_SECRET"]);
    expect(provedor("youtube").variaveis()).toEqual(["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"]);
    expect(DomainError).toBeDefined();
  });
});
