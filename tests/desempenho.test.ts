import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execute, closePool } from "@/lib/db";
import { ForbiddenError } from "@/lib/permissions";
import { DomainError } from "@/lib/services/errors";
import { gerarDesempenho, gerarRanking, informarSeguidoresMes, listarPublicacoes } from "@/lib/services/desempenho";
import { desempenhoParaPlanilhas } from "@/lib/export/relatorio";
import { gerarXlsx } from "@/lib/export/xlsx";
import { cifrar } from "@/lib/integracoes/cripto";
import { equipePadrao, resetTestDb } from "./helpers";

let e: Awaited<ReturnType<typeof equipePadrao>>;
const AGORA = new Date("2026-10-19T12:00:00Z"); // 19/10 09h em Recife/SP

async function post(conta: string, id: string, quando: string, m: Partial<Record<"curtidas" | "comentarios" | "salvamentos" | "compartilhamentos" | "alcance", number>> = {}, tipo = "IMAGE") {
  await execute("INSERT INTO posts_externos (rede, conta_id, id_externo, tipo, legenda, url, publicado_em, alcance, curtidas, comentarios, compartilhamentos, salvamentos, coletado_em) VALUES ('instagram',?,?,?,?,?,?,?,?,?,?,?, ?)",
    [conta, id, tipo, `Legenda ${id}`, `https://www.instagram.com/p/${id}/`, new Date(quando), m.alcance ?? null, m.curtidas ?? null, m.comentarios ?? null, m.compartilhamentos ?? null, m.salvamentos ?? null, AGORA]);
}
const janela = (conta: string, j: string, quando: "atual" | "anterior", de: string, ate: string, v: [number, number, number, number, number, number, number, number]) =>
  execute("INSERT INTO instagram_janelas (conta_id, janela, quando, de, ate, alcance, visualizacoes, visitas_perfil, interacoes, curtidas, comentarios, compartilhamentos, salvamentos, atualizado_em) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)", [conta, j, quando, de, ate, ...v, AGORA]);

beforeAll(async () => {
  process.env.TOKEN_ENC_KEY = "chave-de-teste-para-cifrar-tokens-0123456789";
  await resetTestDb(); e = await equipePadrao();
  await execute("INSERT INTO redes_contas (rede, nome_exibicao, conta_externa_id, status, token_enc, meta) VALUES ('instagram','@novaberith','ig1','conectada',?, '{}')", [cifrar("t")]);
  await execute("INSERT INTO instagram_contas (ig_id, usuario, page_id, token_enc, status, conectada_em) VALUES ('ig2','@outra',NULL,?, 'conectada', NOW())", [cifrar("t2")]);
  // 30 dias: 20/09 a 19/10; anterior: 21/08 a 19/09
  await janela("ig1", "30", "atual", "2026-09-20", "2026-10-19", [65850, 598955, 7997, 10051, 8000, 544, 800, 707]);
  await janela("ig1", "30", "anterior", "2026-08-21", "2026-09-19", [50000, 470000, 7600, 10000, 8000, 500, 700, 800]);
  await janela("ig2", "30", "atual", "2026-09-20", "2026-10-19", [1000, 5000, 100, 200, 150, 20, 20, 10]);
  await execute("INSERT INTO instagram_mensal (conta_id, periodo, alcance, visualizacoes, visitas_perfil, interacoes, atualizado_em) VALUES ('ig1','2026-10',45611,349172,4677,6681,NOW()), ('ig1','2026-09',55488,529753,8866,10708,NOW()), ('ig1','2025-12',1000,2000,10,20,NOW())");
  await execute("INSERT INTO metricas_conta (rede, conta_id, dia, seguidores) VALUES ('instagram','ig1','2026-09-30',22237), ('instagram','ig1','2026-10-10',22260), ('instagram','ig1','2026-10-14',22237), ('instagram','ig1','2026-10-19',22288), ('instagram','ig2','2026-10-19',900)");
  // posts: 4 dentro dos últimos 30 dias, 1 fora
  await post("ig1", "reel1", "2026-10-12T15:00:00Z", { curtidas: 80, comentarios: 10, compartilhamentos: 5, salvamentos: 15, alcance: 1000 }, "REELS"); // 110
  await post("ig1", "feed1", "2026-10-15T15:00:00Z", { curtidas: 20, comentarios: 2 });                                                                  // 22
  await post("ig1", "car1", "2026-10-02T15:00:00Z", { curtidas: 30, salvamentos: 3 }, "CAROUSEL_ALBUM");                                                    // 33
  await post("ig1", "feed2", "2026-09-25T15:00:00Z", { curtidas: 5 });                                                                                   // 5
  await post("ig1", "velho", "2026-08-01T15:00:00Z", { curtidas: 999 });                                                                                 // fora da janela de 30 dias
  await post("ig2", "outra1", "2026-10-11T15:00:00Z", { curtidas: 7 });
});
afterAll(closePool);

describe("painel de desempenho", () => {
  it("rejeita período inválido e exige permissão de ver relatórios", async () => {
    await expect(gerarDesempenho(e.coord, "15", undefined, AGORA)).rejects.toBeInstanceOf(DomainError);
    await expect(gerarDesempenho(e.integ, "30", undefined, AGORA)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(gerarDesempenho(e.semPerfil, "30", undefined, AGORA)).rejects.toBeInstanceOf(ForbiddenError);
  });
  it("30 dias: totais da Meta, período anterior, engajamento e seguidores", async () => {
    const d = await gerarDesempenho(e.coord, "30", undefined, AGORA);
    expect(d.janela).toBe("30"); expect(d.conta).toBe("@novaberith"); expect(d.fonte).toBe("meta");
    expect(d.de).toBe("2026-09-20"); expect(d.ate).toBe("2026-10-19");
    expect(d.atual).toMatchObject({ alcance: 65850, visualizacoes: 598955, visitasPerfil: 7997, interacoes: 10051, curtidas: 8000 });
    expect(d.anterior).toMatchObject({ alcance: 50000, interacoes: 10000 });
    expect(d.engajamento.atual).toBe(15.3); expect(d.engajamento.anterior).toBe(20); // interações ÷ alcance
    expect(d.seguidores.fim).toBe(22288);
    expect(d.seguidores.noPeriodo).toBe(51); // 22288 − 22237 (último registro antes de 20/09? não há: usa o primeiro da janela, 30/09)
  });
  it("mix de formatos, ranking e interações vêm dos posts reais do período", async () => {
    const d = await gerarDesempenho(e.coord, "30", undefined, AGORA);
    expect(d.postsNoPeriodo).toBe(4); expect(d.reels).toBe(1);
    expect(d.mix.map((f) => [f.tipo, f.posts, f.pct])).toEqual([["Feed (imagem/vídeo)", 2, 50], ["Reels", 1, 25], ["Carrossel", 1, 25]]);
    expect(d.ranking.map((p) => [p.id, p.interacoes])).toEqual([["reel1", 110], ["car1", 33], ["feed1", 22], ["feed2", 5]]); // "velho" (agosto) fica de fora
  });
  it("7 dias sem totais da Meta ainda: vazio, nunca inventado", async () => {
    const d = await gerarDesempenho(e.coord, "7", undefined, AGORA);
    expect(d.atual).toBeNull(); expect(d.anterior).toBeNull(); expect(d.engajamento).toEqual({ atual: null, anterior: null });
    expect(d.postsNoPeriodo).toBe(1); // só 15/10 (12/10 está fora dos últimos 7 dias)
  });
  it("Ano e Todo somam os meses sincronizados; Ano compara com o ano anterior", async () => {
    const ano = await gerarDesempenho(e.coord, "ano", undefined, AGORA);
    expect(ano.fonte).toBe("meses");
    expect(ano.atual).toMatchObject({ alcance: 45611 + 55488, interacoes: 6681 + 10708, comentarios: null });
    expect(ano.anterior).toMatchObject({ alcance: 1000, interacoes: 20 });
    const todo = await gerarDesempenho(e.coord, "todo", undefined, AGORA);
    expect(todo.atual?.alcance).toBe(45611 + 55488 + 1000); expect(todo.anterior).toBeNull();
  });
  it("histórico mensal, evolução de seguidores e destaques por mês", async () => {
    const d = await gerarDesempenho(e.coord, "30", undefined, AGORA);
    expect(d.historico.map((h) => h.periodo)).toEqual(["2026-10", "2026-09", "2025-12"]);
    expect(d.historico[0]).toMatchObject({ seguidores: 22288, alcance: 45611, visitasPerfil: 4677 });
    expect(d.evolucaoSeguidores).toEqual([{ periodo: "2026-09", seguidores: 22237 }, { periodo: "2026-10", seguidores: 22288 }]);
    expect(d.serieSeguidores).toHaveLength(4);
    expect(d.destaques[0].periodo).toBe("Outubro de 2026"); expect(d.destaques[0].posts[0]).toMatchObject({ interacoes: 110 });
  });
  it("com mais de uma conta: seletor, dados separados e comparativo", async () => {
    const d2 = await gerarDesempenho(e.coord, "30", "ig2", AGORA);
    expect(d2.conta).toBe("@outra"); expect(d2.atual).toMatchObject({ alcance: 1000 }); expect(d2.ranking.map((p) => p.id)).toEqual(["outra1"]); expect(d2.seguidores.fim).toBe(900);
    const d = await gerarDesempenho(e.coord, "30", undefined, AGORA);
    expect(d.comparativo?.map((c) => [c.usuario, c.seguidores, c.alcance])).toEqual([["@novaberith", 22288, 65850], ["@outra", 900, 1000]]);
  });
  it("exporta Excel com resumo, formatos, ranking e histórico", async () => {
    const d = await gerarDesempenho(e.coord, "30", undefined, AGORA);
    const pl = desempenhoParaPlanilhas(d);
    expect(pl.map((p) => p.nome)).toEqual(["Resumo", "Formatos", "Ranking", "Histórico mensal"]);
    expect(pl[0].linhas.find((l) => l[0] === "Alcance")).toEqual(["Alcance", 65850, 50000, 31.7]);
    expect(gerarXlsx(pl).length).toBeGreaterThan(1000);
  });
});

describe("filtro de ano", () => {
  it("lista os anos com dados até o corrente e calcula o ano escolhido (inteiro se já passou)", async () => {
    const d = await gerarDesempenho(e.coord, "ano", undefined, AGORA, "2025");
    expect(d.anos).toEqual(["2025", "2026"]); expect(d.ano).toBe("2025"); expect(d.de).toBe("2025-01-01"); expect(d.ate).toBe("2025-12-31");
    expect(d.atual).toMatchObject({ alcance: 1000 }); expect(d.rotulo).toBe("2025");
    const atual = await gerarDesempenho(e.coord, "ano", undefined, AGORA);
    expect(atual.ano).toBe("2026"); expect(atual.ate).toBe("2026-10-19"); expect(atual.atual?.alcance).toBe(45611 + 55488);
    const lixo = await gerarDesempenho(e.coord, "ano", undefined, AGORA, "abc");
    expect(lixo.ano).toBe("2026");
  });
});

describe("publicações (cartões), ranking e seguidores", () => {
  it("cartões: engajamento por post, grupos por formato, filtro e ordenação", async () => {
    const r = await listarPublicacoes(e.coord, { janela: "30" }, AGORA);
    expect(r.total).toBe(4); expect(r.melhor?.id).toBe("reel1");
    const reel = r.posts.find((p) => p.id === "reel1")!; expect(reel.engajamento).toBe(11); // 110 ÷ 1000
    expect(r.posts.find((p) => p.id === "feed1")!.engajamento).toBeNull(); // sem alcance → nunca inventa
    expect(r.grupos.map((g) => [g.formato, g.posts])).toEqual([["Feed", 2], ["Reels", 1], ["Carrossel", 1]]);
    expect((await listarPublicacoes(e.coord, { janela: "30", formato: "Reels" }, AGORA)).posts.map((p) => p.id)).toEqual(["reel1"]);
    expect((await listarPublicacoes(e.coord, { janela: "30", ordem: "interacoes" }, AGORA)).posts.map((p) => p.id)).toEqual(["reel1", "car1", "feed1", "feed2"]);
    expect((await listarPublicacoes(e.coord, { janela: "30", ordem: "recentes" }, AGORA)).posts[0].id).toBe("feed1");
    expect((await listarPublicacoes(e.coord, { janela: "ano", ano: "2026" }, AGORA)).total).toBe(5); // inclui o de agosto
    await expect(listarPublicacoes(e.integ, {}, AGORA)).rejects.toBeInstanceOf(ForbiddenError);
  });
  it("ranking por mês e por ano: seguidores, variação, totais, posts e reels", async () => {
    const m = await gerarRanking(e.coord, {}, AGORA);
    expect(m.linhas[0]).toMatchObject({ periodo: "2026-10", seguidores: 22288, variacao: 51, alcance: 45611, posts: 2, reels: 1 }); // 22288 − 22237 (set); "posts" não inclui reels
    expect(m.linhas.find((l) => l.periodo === "2026-09")).toMatchObject({ seguidores: 22237, alcance: 55488, posts: 1 });
    expect(m.top[0].id).toBe("velho"); expect(m.top[1].id).toBe("reel1"); expect(m.top.length).toBeLessThanOrEqual(10);
    const a = await gerarRanking(e.coord, { agrupar: "ano" }, AGORA);
    expect(a.linhas.map((l) => l.periodo)).toEqual(["2026", "2025"]);
    expect(a.linhas[0]).toMatchObject({ alcance: 45611 + 55488, interacoes: 6681 + 10708 });
  });
  it("seguidores informados à mão: só meses sem registro, só por quem gerencia integrações, sem futuro", async () => {
    await informarSeguidoresMes(e.admin, undefined, "2026-05", 20000, AGORA);
    const m = await gerarRanking(e.coord, {}, AGORA);
    expect(m.linhas.find((l) => l.periodo === "2026-05")?.seguidores).toBe(20000);
    await expect(informarSeguidoresMes(e.admin, undefined, "2026-09", 1, AGORA)).rejects.toThrow(/já tem registro/); // nunca sobrescreve coleta
    await expect(informarSeguidoresMes(e.admin, undefined, "2027-01", 1, AGORA)).rejects.toThrow(/ainda não começou/);
    await expect(informarSeguidoresMes(e.admin, undefined, "2026-13", 1, AGORA)).rejects.toBeInstanceOf(DomainError);
    await expect(informarSeguidoresMes(e.admin, undefined, "2026-04", -5, AGORA)).rejects.toBeInstanceOf(DomainError);
    await expect(informarSeguidoresMes(e.coord, undefined, "2026-04", 100, AGORA)).rejects.toBeInstanceOf(ForbiddenError);
  });
});
