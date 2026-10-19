import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { execute, query, closePool } from "@/lib/db";
import { ForbiddenError } from "@/lib/permissions";
import { DomainError } from "@/lib/services/errors";
import * as P from "@/lib/services/publicacoes";
import * as A from "@/lib/services/agendamento";
import { setSetting } from "@/lib/services/configuracoes";
import { definirProvedores } from "@/lib/integracoes";
import { cifrar } from "@/lib/integracoes/cripto";
import type { ConteudoPublicar, Provedor, ResultadoPublicacao } from "@/lib/integracoes/tipos";
import type { Rede } from "@/lib/editorial";
import { localToUtc, utcToLocal } from "@/lib/time";
import { criarMidia, equipePadrao, pubBase, resetTestDb } from "./helpers";

let e: Awaited<ReturnType<typeof equipePadrao>>;
let img: number, vid: number;
const X = { prazo: null, publicarEm: null };
const AGORA = new Date("2026-10-20T12:00:00Z");
const EM = (min: number) => new Date(AGORA.getTime() + min * 60_000);

type Chamada = { rede: Rede; c: ConteudoPublicar; token: string };
let chamadas: Chamada[] = [];
let respostas: Partial<Record<Rede, ResultadoPublicacao | (() => Promise<ResultadoPublicacao>)>> = {};
const falso = (rede: Rede): Provedor => ({
  rede, configurado: () => true, variaveis: () => [], escopos: () => [], urlAutorizacao: () => "https://x", trocarCodigo: async () => { throw new Error("n/a"); },
  renovar: async () => ({ accessToken: "novo-token", expiraEm: new Date(Date.now() + 3600_000) }),
  async publicar(conta, c) {
    chamadas.push({ rede, c, token: conta.token });
    const r = respostas[rede];
    return typeof r === "function" ? r() : r ?? { ok: true, idExterno: `${rede}-${c.publicacaoId}`, url: `https://${rede}.example/${c.publicacaoId}` };
  },
  metricasPublicacao: async () => ({ alcance: 100, curtidas: 10, comentarios: 2, visualizacoes: 300 }),
  metricasConta: async () => ({ seguidores: 1234 }),
  listarPostsConta: async () => [
    { idExterno: "ig-a", tipo: "REELS", legenda: "Reel do retiro", url: "https://www.instagram.com/reel/a/", publicadoEm: new Date("2026-10-18T15:00:00Z"), alcance: 900, curtidas: 50, comentarios: 5, compartilhamentos: 4, salvamentos: 6, visualizacoes: 1200 },
    { idExterno: "ig-b", tipo: "IMAGE", legenda: "Post feito direto no Instagram", url: "https://www.instagram.com/p/b/", publicadoEm: new Date("2026-10-10T12:00:00Z"), curtidas: 12, comentarios: 1 },
  ],
});

async function conectar(rede: Rede, expira: Date | null = null) {
  await execute("INSERT INTO redes_contas (rede, nome_exibicao, conta_externa_id, status, token_enc, expira_em, meta) VALUES (?,?,?, 'conectada', ?,?, '{}') ON DUPLICATE KEY UPDATE status='conectada', token_enc=VALUES(token_enc), expira_em=VALUES(expira_em)", [rede, `conta ${rede}`, `ext-${rede}`, cifrar(`tok-${rede}`), expira]);
}

beforeAll(async () => {
  process.env.TOKEN_ENC_KEY = "chave-de-teste-para-cifrar-tokens-0123456789";
  process.env.MEDIA_URL_SECRET = "segredo-de-teste-para-urls-assinadas-123456";
  await resetTestDb(); e = await equipePadrao(); img = await criarMidia(e.admin); vid = await criarMidia(e.admin, "video");
  definirProvedores({ instagram: falso("instagram"), facebook: falso("facebook"), tiktok: falso("tiktok"), youtube: falso("youtube") });
});
afterAll(async () => { definirProvedores(null); await closePool(); });
beforeEach(async () => {
  chamadas = []; respostas = {};
  await execute("DELETE FROM redes_contas"); await execute("DELETE FROM notificacoes"); await execute("DELETE FROM publicacoes"); await execute("DELETE FROM metricas_conta"); await setSetting("exigir_aprovacao", "1");
});

async function aprovada(o = {}) {
  const id = await P.criar(e.integ, pubBase({ midiaIds: [img], redes: ["instagram", "facebook"], ...o }), X);
  await P.enviarParaRevisao(e.integ, id); await P.decidir(e.aprov, id, "aprovado", null);
  return id;
}
const redes = (id: number) => query<any>("SELECT * FROM publicacao_redes WHERE publicacao_id = ? ORDER BY rede", [id]);
const st = async (id: number) => (await query<any>("SELECT status FROM publicacoes WHERE id = ?", [id]))[0].status;

describe("agendar", () => {
  it("só conteúdo aprovado, com horário futuro, por quem tem permissão", async () => {
    const rasc = await P.criar(e.integ, pubBase({ midiaIds: [img] }), X);
    await expect(A.agendar(e.coord, rasc, EM(60), AGORA)).rejects.toThrow(/aprovado/);
    const id = await aprovada();
    await expect(A.agendar(e.integ, id, EM(60), AGORA)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(A.agendar(e.coord, id, EM(-5), AGORA)).rejects.toThrow(/futuro/);
    await A.agendar(e.coord, id, EM(60), AGORA);
    expect(await st(id)).toBe("agendado");
    expect((await redes(id)).map((r) => r.envio)).toEqual(["agendada", "agendada"]);
    expect(new Date((await redes(id))[0].agendada_para).getTime()).toBe(EM(60).getTime());
  });
  it("com a exigência de aprovação desligada, agenda conteúdo ainda não aprovado", async () => {
    await setSetting("exigir_aprovacao", "0");
    const id = await P.criar(e.integ, pubBase({ midiaIds: [img] }), X);
    await P.enviarParaRevisao(e.integ, id);
    await A.agendar(e.coord, id, EM(30), AGORA); expect(await st(id)).toBe("agendado");
  });
  it("não agenda conteúdo com problemas", async () => {
    const id = await aprovada();
    await execute("DELETE FROM publicacao_midias WHERE publicacao_id = ?", [id]);
    await expect(A.agendar(e.coord, id, EM(60), AGORA)).rejects.toThrow(/Conteúdo incompleto/);
  });
  it("reagenda, desagenda e move para outro dia mantendo o horário", async () => {
    const id = await aprovada();
    await A.agendar(e.coord, id, localToUtc("2026-10-25", "19:30"), AGORA);
    await A.moverParaDia(e.coord, id, "2026-10-27", AGORA);
    const p = (await P.getPub(e.coord, id)).pub;
    expect(utcToLocal(new Date(p.publicar_em!))).toMatchObject({ date: "2026-10-27", time: "19:30" });
    expect(utcToLocal(new Date((await redes(id))[0].agendada_para)).date).toBe("2026-10-27");
    await expect(A.reagendar(e.coord, id, EM(-10), AGORA)).rejects.toThrow(/futuro/);
    await A.desagendar(e.coord, id);
    expect(await st(id)).toBe("aprovado"); expect((await redes(id)).every((r) => r.envio === "pendente")).toBe(true);
    await expect(A.desagendar(e.coord, id)).rejects.toThrow(/não está agendada/);
  });
  it("arrastar um rascunho só muda a data planejada (não agenda nada)", async () => {
    const id = await P.criar(e.integ, pubBase({ midiaIds: [img] }), { prazo: null, publicarEm: localToUtc("2026-10-22", "10:00") });
    await A.moverParaDia(e.integ, id, "2026-10-29", AGORA);
    const p = (await P.getPub(e.integ, id)).pub;
    expect(p.status).toBe("rascunho"); expect(utcToLocal(new Date(p.publicar_em!))).toMatchObject({ date: "2026-10-29", time: "10:00" });
    expect((await redes(id)).every((r) => r.envio === "pendente")).toBe(true);
    await expect(A.moverParaDia(e.integ2, id, "2026-10-30", AGORA)).rejects.toBeInstanceOf(ForbiddenError); // não é dele
    await expect(A.moverParaDia(e.semPerfil, id, "2026-10-30", AGORA)).rejects.toBeInstanceOf(ForbiddenError);
  });
  it("editar o conteúdo de um agendado cancela o agendamento", async () => {
    const id = await aprovada();
    await A.agendar(e.coord, id, EM(60), AGORA);
    await P.atualizar(e.integ, id, pubBase({ legenda: "Mudou", midiaIds: [img], redes: ["instagram", "facebook"] }), X);
    expect(await st(id)).toBe("em_producao"); expect((await redes(id)).every((r) => r.envio === "pendente")).toBe(true);
  });
});

describe("processar a fila", () => {
  it("publica o que venceu, registra tentativa e marca como publicado quando todas as redes saem", async () => {
    await conectar("instagram"); await conectar("facebook");
    const id = await aprovada(); await A.agendar(e.coord, id, EM(10), AGORA);
    expect((await A.processarFila("https://app.exemplo.org", EM(5))).processadas).toBe(0); // ainda não venceu
    const r = await A.processarFila("https://app.exemplo.org", EM(11));
    expect(r).toMatchObject({ processadas: 2, publicadas: 2, falhas: 0 });
    expect(chamadas.map((c) => [c.rede, c.token])).toEqual([["instagram", "tok-instagram"], ["facebook", "tok-facebook"]]);
    expect(chamadas[0].c.midias[0].url).toMatch(/^https:\/\/app\.exemplo\.org\/api\/midias\/publica\/\d+\?exp=\d+&sig=/);
    expect(chamadas[0].c.texto).toBe("Legenda de teste\n\n#teste");
    expect(await st(id)).toBe("publicado");
    const rd = await redes(id);
    expect(rd.every((x) => x.envio === "publicada" && x.assistida === 0 && x.post_externo_id)).toBe(true);
    expect((await query<any>("SELECT resultado FROM publicacao_tentativas")).map((t: any) => t.resultado)).toEqual(["sucesso", "sucesso"]);
    expect((await P.historico(e.coord, id)).map((h) => h.acao)).toEqual(expect.arrayContaining(["publicada_automatica", "publicado"]));
    expect((await A.processarFila("https://app.exemplo.org", EM(12))).processadas).toBe(0); // nada é publicado duas vezes
    expect(chamadas).toHaveLength(2);
  });
  it("sem conta conectada: falha definitiva clara, aviso à equipe e sugestão de publicação assistida", async () => {
    const id = await aprovada({ redes: ["instagram"] }); await A.agendar(e.coord, id, EM(10), AGORA);
    const r = await A.processarFila("https://app.exemplo.org", EM(11));
    expect(r).toMatchObject({ processadas: 1, publicadas: 0, falhas: 1 });
    const [rd] = await redes(id);
    expect(rd.envio).toBe("falhou"); expect(rd.ultimo_erro).toMatch(/não conectada.*publicação assistida/i);
    expect(chamadas).toHaveLength(0); expect(await st(id)).toBe("agendado");
    const n = await query<any>("SELECT user_id FROM notificacoes WHERE tipo = 'falha'");
    expect(n.map((x: any) => x.user_id)).toEqual(expect.arrayContaining([e.admin, e.coord]));
  });
  it("falha transitória: tenta de novo com espera crescente e desiste na 3ª", async () => {
    await conectar("instagram");
    respostas.instagram = { ok: false, erro: "HTTP 500: instabilidade", httpStatus: 500 };
    const id = await aprovada({ redes: ["instagram"] }); await A.agendar(e.coord, id, EM(10), AGORA);
    expect((await A.processarFila("https://x.org", EM(11))).reagendadas).toBe(1);
    expect((await redes(id))[0]).toMatchObject({ envio: "agendada", tentativas: 1 });
    expect((await A.processarFila("https://x.org", EM(12))).processadas).toBe(0); // aguardando 5 min
    expect((await A.processarFila("https://x.org", EM(17))).reagendadas).toBe(1);
    expect((await A.processarFila("https://x.org", EM(17 + 5))).processadas).toBe(0); // agora 10 min
    const ultimo = await A.processarFila("https://x.org", EM(17 + 10 + 1));
    expect(ultimo.falhas).toBe(1);
    expect((await redes(id))[0]).toMatchObject({ envio: "falhou", tentativas: 3 });
    expect((await A.tentativas(e.coord, (await redes(id))[0].id)).map((t) => t.resultado)).toEqual(["falha", "falha", "falha"]);
  });
  it("erro 4xx (rejeição) é definitivo na primeira tentativa; token inválido marca a conta como expirada", async () => {
    await conectar("facebook");
    respostas.facebook = { ok: false, erro: "HTTP 400: imagem inválida", httpStatus: 400, definitivo: true, reconectar: true };
    const id = await aprovada({ redes: ["facebook"] }); await A.agendar(e.coord, id, EM(10), AGORA);
    await A.processarFila("https://x.org", EM(11));
    expect((await redes(id))[0]).toMatchObject({ envio: "falhou", tentativas: 1 });
    expect((await query<any>("SELECT status FROM redes_contas WHERE rede = 'facebook'"))[0].status).toBe("expirada");
  });
  it("tokens e códigos nunca aparecem nos erros gravados", async () => {
    await conectar("instagram");
    respostas.instagram = { ok: false, erro: "falha access_token=EAABsecreto123 e Bearer abc.def.ghi", definitivo: true };
    const id = await aprovada({ redes: ["instagram"] }); await A.agendar(e.coord, id, EM(10), AGORA);
    await A.processarFila("https://x.org", EM(11));
    const [rd] = await redes(id);
    expect(rd.ultimo_erro).not.toMatch(/EAABsecreto123|abc\.def\.ghi/);
    expect(JSON.stringify(await query<any>("SELECT * FROM integracao_logs"))).not.toMatch(/EAABsecreto123/);
  });
  it("execuções simultâneas não publicam duas vezes", async () => {
    await conectar("instagram");
    let liberar!: () => void; const trava = new Promise<void>((r) => (liberar = r));
    respostas.instagram = async () => { await trava; return { ok: true, idExterno: "ig-1" }; };
    const id = await aprovada({ redes: ["instagram"] }); await A.agendar(e.coord, id, EM(10), AGORA);
    const a = A.processarFila("https://x.org", EM(11));
    await new Promise((r) => setTimeout(r, 150));
    const b = await A.processarFila("https://x.org", EM(11));
    expect(b.ocupado).toBe(true);
    liberar(); expect((await a).publicadas).toBe(1); expect(chamadas).toHaveLength(1);
  });
  it("envio que ficou 'publicando' é tratado como incerto: não repete sozinho", async () => {
    await conectar("instagram");
    const id = await aprovada({ redes: ["instagram"] }); await A.agendar(e.coord, id, EM(10), AGORA);
    const rid = (await redes(id))[0].id;
    await execute("UPDATE publicacao_redes SET envio = 'publicando', tentativas = 1 WHERE id = ?", [rid]);
    await execute("INSERT INTO publicacao_tentativas (publicacao_rede_id, iniciada_em) VALUES (?, ?)", [rid, EM(0)]);
    const r = await A.processarFila("https://x.org", EM(60));
    expect(r.recuperadas).toBe(1); expect(chamadas).toHaveLength(0);
    expect((await redes(id))[0]).toMatchObject({ envio: "falhou" }); expect((await redes(id))[0].ultimo_erro).toMatch(/Confira na rede social/);
  });
  it("renova o token que está perto de expirar; sem renovação possível, marca expirada e falha com orientação", async () => {
    await conectar("instagram", EM(5));
    const id = await aprovada({ redes: ["instagram"] }); await A.agendar(e.coord, id, EM(10), AGORA);
    await A.processarFila("https://x.org", EM(11));
    expect(chamadas[0].token).toBe("novo-token");
    expect(JSON.stringify(await query<any>("SELECT token_enc FROM redes_contas"))).not.toMatch(/novo-token/); // continua cifrado
    // renovação que falha
    chamadas = []; await conectar("facebook", EM(5));
    definirProvedores({ facebook: { ...falso("facebook"), renovar: async () => { throw new Error("refresh recusado code=ABC"); } } });
    const id2 = await aprovada({ redes: ["facebook"] }); await A.agendar(e.coord, id2, EM(100), EM(50));
    await A.processarFila("https://x.org", EM(101));
    expect(chamadas).toHaveLength(0); expect((await redes(id2))[0].ultimo_erro).toMatch(/Reconecte/);
    expect((await query<any>("SELECT status, ultimo_erro FROM redes_contas WHERE rede = 'facebook'"))[0]).toMatchObject({ status: "expirada" });
    definirProvedores({ facebook: falso("facebook") });
  });
});

describe("reprocessar, cancelar e publicação assistida", () => {
  it("reprocessa só o que falhou, sem tocar nas redes já publicadas", async () => {
    await conectar("instagram"); await conectar("facebook");
    respostas.facebook = { ok: false, erro: "HTTP 400", definitivo: true };
    const id = await aprovada(); await A.agendar(e.coord, id, EM(10), AGORA);
    await A.processarFila("https://x.org", EM(11));
    const [ig, fb] = await redes(id); // ENUM: instagram vem antes de facebook
    expect([ig.envio, fb.envio]).toEqual(["publicada", "falhou"]);
    await expect(A.reprocessar(e.integ, fb.id, EM(20))).rejects.toBeInstanceOf(ForbiddenError);
    await expect(A.reprocessar(e.coord, ig.id, EM(20))).rejects.toThrow(/falhou/);
    respostas.facebook = undefined; chamadas = [];
    await A.reprocessar(e.coord, fb.id, EM(20));
    await A.processarFila("https://x.org", EM(21));
    expect(chamadas.map((c) => c.rede)).toEqual(["facebook"]); // instagram não é publicado de novo
    expect(await st(id)).toBe("publicado");
  });
  it("publicação assistida: confirma manualmente, registra como assistida e fecha o ciclo", async () => {
    const id = await aprovada({ redes: ["instagram"] });
    const [r] = await redes(id);
    const prep = await A.preparoAssistido(e.integ, r.id);
    expect(prep).toMatchObject({ rede: "instagram", texto: "Legenda de teste\n\n#teste", abrir: "https://www.instagram.com/" }); expect(prep.midias).toHaveLength(1);
    await expect(A.marcarPublicadaManual(e.integ, r.id)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(A.marcarPublicadaManual(e.coord, r.id, { url: "javascript:alert(1)" })).rejects.toThrow(/https/);
    await A.marcarPublicadaManual(e.coord, r.id, { url: "https://www.instagram.com/p/ABC123/" }, EM(1));
    expect((await redes(id))[0]).toMatchObject({ envio: "publicada", assistida: 1, url_externa: "https://www.instagram.com/p/ABC123/" });
    expect(await st(id)).toBe("publicado");
    await expect(A.marcarPublicadaManual(e.coord, r.id)).rejects.toThrow(/já consta/);
    expect(chamadas).toHaveLength(0); // nada foi enviado por API: não finge publicação automática
  });
  it("não permite marcar como publicada conteúdo que ainda não foi aprovado", async () => {
    const id = await P.criar(e.integ, pubBase({ midiaIds: [img] }), X);
    await expect(A.marcarPublicadaManual(e.coord, (await redes(id))[0].id)).rejects.toThrow(/aprovado ou agendado/);
  });
  it("cancelar a única rede ativa devolve o conteúdo para 'aprovado'", async () => {
    const id = await aprovada({ redes: ["instagram"] }); await A.agendar(e.coord, id, EM(30), AGORA);
    await A.cancelarRede(e.coord, (await redes(id))[0].id);
    expect(await st(id)).toBe("aprovado");
  });
  it("a fila lista com status e a visão é restrita a quem pode ver", async () => {
    const id = await aprovada(); await A.agendar(e.coord, id, EM(30), AGORA);
    const f = await A.fila(e.aprov, { envio: ["agendada"] });
    expect(f.filter((x) => x.publicacao_id === id)).toHaveLength(2);
    await expect(A.fila(e.semPerfil)).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe("métricas e lembretes", () => {
  it("coleta métricas oficiais só de publicações automáticas, sem repetir em 6 horas", async () => {
    await conectar("instagram");
    const id = await aprovada({ redes: ["instagram"] }); await A.agendar(e.coord, id, EM(10), AGORA);
    await A.processarFila("https://x.org", EM(11));
    expect(await A.coletarMetricas(EM(12))).toEqual({ publicacoes: 1, contas: 1, postsConta: 2 });
    expect(await A.coletarMetricas(EM(13))).toMatchObject({ publicacoes: 0 });
    const m = (await query<any>("SELECT alcance, curtidas, salvamentos FROM metricas_publicacao"))[0];
    expect(m).toMatchObject({ alcance: 100, curtidas: 10, salvamentos: null }); // não informada → NULL (nunca zero inventado)
    expect((await query<any>("SELECT seguidores FROM metricas_conta WHERE rede='instagram'"))[0].seguidores).toBe(1234);
  });
  it("importa os posts da conta inteira (inclusive os feitos fora do app), sem repetir em 6 horas e sem inventar métricas", async () => {
    await conectar("instagram");
    const posts = await query<any>("SELECT id_externo, tipo, alcance, curtidas, salvamentos FROM posts_externos ORDER BY id_externo");
    expect(posts.map((p) => p.id_externo)).toEqual(["ig-a", "ig-b"]);
    expect(posts[0]).toMatchObject({ tipo: "REELS", alcance: 900, curtidas: 50, salvamentos: 6 });
    expect(posts[1]).toMatchObject({ alcance: null, salvamentos: null, curtidas: 12 }); // não informada → NULL
    expect((await A.coletarMetricas(EM(13))).postsConta).toBe(0);
    expect((await A.coletarMetricas(EM(12 + 7 * 60))).postsConta).toBe(2);
    expect((await query<any>("SELECT COUNT(*) n FROM posts_externos"))[0].n).toBe(2); // atualiza, não duplica
  });
  it("atualização manual ignora a janela de 6 h, exige permissão e mostra o erro da rede", async () => {
    await conectar("instagram");
    expect(await A.sincronizarContaAgora(e.coord, "instagram", EM(14))).toEqual({ posts: 2, erro: undefined });
    expect((await A.sincronizarContaAgora(e.coord, "instagram", EM(15))).posts).toBe(2); // de novo, sem esperar 6 h
    await expect(A.sincronizarContaAgora(e.semPerfil, "instagram", EM(15))).rejects.toBeInstanceOf(ForbiddenError);
    definirProvedores({ instagram: { ...falso("instagram"), listarPostsConta: async () => { throw new Error("HTTP 400: (#10) Permissão ausente"); } } });
    expect(await A.sincronizarContaAgora(e.coord, "instagram", EM(16))).toMatchObject({ posts: 0, erro: expect.stringContaining("Permissão ausente") });
    definirProvedores({ instagram: { ...falso("instagram"), listarPostsConta: async () => [] } });
    expect((await A.sincronizarContaAgora(e.coord, "instagram", EM(17))).erro).toMatch(/não devolveu nenhum post/);
    definirProvedores({ instagram: falso("instagram"), facebook: falso("facebook") });
    await execute("DELETE FROM redes_contas");
    expect((await A.sincronizarContaAgora(e.coord, "instagram", EM(18))).erro).toMatch(/não conectada/i);
  });
  it("não coleta de publicação assistida", async () => {
    await execute("DELETE FROM metricas_publicacao");
    const id = await aprovada({ redes: ["facebook"] });
    await A.marcarPublicadaManual(e.coord, (await redes(id))[0].id, {}, EM(1));
    expect((await A.coletarMetricas(EM(500))).publicacoes).toBe(0);
  });
  it("lembra do prazo (uma vez) e de publicação próxima", async () => {
    const prazo = new Date(AGORA.getTime() + 6 * 3600_000);
    const id = await P.criar(e.coord, pubBase({ midiaIds: [img], responsavelId: e.integ }), { prazo, publicarEm: null });
    expect((await A.gerarLembretes(AGORA)).prazos).toBe(1);
    expect((await A.gerarLembretes(EM(30))).prazos).toBe(0);
    expect((await query<any>("SELECT user_id, tipo FROM notificacoes WHERE dedupe_key LIKE 'prazo:%'"))[0]).toMatchObject({ user_id: e.integ, tipo: "prazo" });
    void id;
    const ag = await aprovada({ redes: ["instagram"] }); await A.agendar(e.coord, ag, EM(30), AGORA);
    expect((await A.gerarLembretes(AGORA)).proximas).toBeGreaterThan(0);
  });
});
