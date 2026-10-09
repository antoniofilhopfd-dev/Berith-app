import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { closePool, query } from "@/lib/db";
import { ForbiddenError } from "@/lib/permissions";
import {
  alternarConcluido, alternarFavorito, criarConteudo, criarTrilha, editarConteudo, excluirConteudo, excluirTrilha, getConteudo, getTrilha,
  listarConteudos, listarTrilhas,
} from "@/lib/services/formacao";
import { DomainError, NotFoundError } from "@/lib/services/errors";
import { conteudoSchema, trilhaSchema } from "@/lib/validation/formacao";
import { resetTestDb, criarUsuario, criarUnidade, darPapel, vincular } from "./helpers";

let admin = 0, com = 0, coordA = 0, membroA = 0, membroB = 0, sem = 0, A = 0, B = 0;
const c = (o: Record<string, unknown> = {}) => conteudoSchema.parse({ categoria: "formacao", titulo: "Conteúdo de teste", fonteNome: "Fonte de teste", unitId: "", ...o });

beforeAll(async () => {
  await resetTestDb();
  admin = await criarUsuario("a@t.com"); com = await criarUsuario("c@t.com"); coordA = await criarUsuario("ca@t.com");
  membroA = await criarUsuario("ma@t.com", "Maria"); membroB = await criarUsuario("mb@t.com"); sem = await criarUsuario("s@t.com");
  await darPapel(admin, "admin_geral"); await darPapel(com, "resp_comunicacao");
  A = await criarUnidade("ministerio", "A"); B = await criarUnidade("ministerio", "B");
  await darPapel(coordA, "coord_ministerio", A); await vincular(membroA, A); await vincular(membroB, B);
});
afterAll(closePool);

describe("validação", () => {
  it("fonte é obrigatória e links só http(s)", () => {
    expect(() => c({ fonteNome: "" })).toThrow(/fonte/i);
    expect(() => c({ fonteUrl: "javascript:alert(1)" })).toThrow();
    expect(() => c({ categoria: "inventada" })).toThrow();
    expect(c({ fonteUrl: "https://exemplo.org" }).fonteUrl).toBe("https://exemplo.org");
  });
});

describe("conteúdos: escopo e permissões", () => {
  it("comunicação/admin publicam para toda a comunidade; coordenação só na própria estrutura", async () => {
    await expect(criarConteudo(membroA, c())).rejects.toThrow(ForbiddenError);
    await expect(criarConteudo(coordA, c())).rejects.toThrow(ForbiddenError); // comunidade inteira
    await expect(criarConteudo(coordA, c({ unitId: String(B) }))).rejects.toThrow(ForbiddenError);
    expect(await criarConteudo(com, c({ categoria: "oracao", titulo: "Oração da comunidade" }))).toBeGreaterThan(0);
    expect(await criarConteudo(coordA, c({ unitId: String(A), titulo: "Formação só do A" }))).toBeGreaterThan(0);
  });
  it("conteúdo exclusivo da estrutura não aparece para outras (lista nem URL direta)", async () => {
    const t = async (u: number) => (await listarConteudos(u)).itens.map((i) => i.titulo).sort();
    expect(await t(membroA)).toEqual(["Formação só do A", "Oração da comunidade"]);
    expect(await t(membroB)).toEqual(["Oração da comunidade"]);
    expect(await t(sem)).toEqual(["Oração da comunidade"]);
    const [x] = await query<any>("SELECT id FROM conteudos WHERE titulo = 'Formação só do A'");
    await expect(getConteudo(membroB, x.id)).rejects.toThrow(NotFoundError);
    await expect(getConteudo(sem, x.id)).rejects.toThrow(NotFoundError);
    expect((await getConteudo(membroA, x.id)).fonte_nome).toBe("Fonte de teste");
  });
  it("rascunho só é visto por quem edita", async () => {
    const id = await criarConteudo(coordA, c({ unitId: String(A), titulo: "Rascunho", publicado: "0" }));
    expect((await listarConteudos(membroA)).itens.map((i) => i.titulo)).not.toContain("Rascunho");
    await expect(getConteudo(membroA, id)).rejects.toThrow(NotFoundError);
    expect((await listarConteudos(coordA)).itens.map((i) => i.titulo)).toContain("Rascunho");
    await editarConteudo(coordA, id, c({ unitId: String(A), titulo: "Rascunho", publicado: "1" }));
    expect((await getConteudo(membroA, id)).titulo).toBe("Rascunho");
  });
  it("editar/excluir exigem permissão no escopo", async () => {
    const [x] = await query<any>("SELECT id FROM conteudos WHERE titulo = 'Oração da comunidade'");
    await expect(editarConteudo(coordA, x.id, c())).rejects.toThrow(ForbiddenError);
    await expect(excluirConteudo(membroA, x.id)).rejects.toThrow(ForbiddenError);
  });
});

describe("busca, categorias e favoritos", () => {
  beforeAll(async () => {
    await criarConteudo(com, c({ categoria: "catequese", titulo: "Os sacramentos", resumo: "Introdução", corpo: "Batismo, Eucaristia e Crisma" }));
    await criarConteudo(com, c({ categoria: "doutrina", titulo: "Porcentagem 100% fiel", corpo: "texto com _ e % especiais" }));
  });
  it("filtra por categoria e busca em título, resumo e corpo", async () => {
    expect((await listarConteudos(sem, { categoria: "catequese" })).itens.map((i) => i.titulo)).toEqual(["Os sacramentos"]);
    expect((await listarConteudos(sem, { q: "Eucaristia" })).itens.map((i) => i.titulo)).toEqual(["Os sacramentos"]);
    expect((await listarConteudos(sem, { q: "Introdução" })).total).toBe(1);
  });
  it("busca trata % e _ como texto e não aceita injeção", async () => {
    expect((await listarConteudos(sem, { q: "100%" })).itens.map((i) => i.titulo)).toEqual(["Porcentagem 100% fiel"]);
    expect((await listarConteudos(sem, { q: "%" })).itens.map((i) => i.titulo)).toEqual(["Porcentagem 100% fiel"]);
    expect((await listarConteudos(sem, { q: "' OR 1=1 --" })).total).toBe(0);
  });
  it("favoritos e concluídos são pessoais", async () => {
    const [x] = await query<any>("SELECT id FROM conteudos WHERE titulo = 'Os sacramentos'");
    expect(await alternarFavorito(membroA, x.id)).toBe(true);
    expect((await listarConteudos(membroA, { favoritos: true })).itens.map((i) => i.titulo)).toEqual(["Os sacramentos"]);
    expect((await listarConteudos(membroB, { favoritos: true })).itens).toEqual([]);
    expect(await alternarFavorito(membroA, x.id)).toBe(false);
    expect(await alternarConcluido(membroA, x.id)).toBe(true);
    expect(Number((await getConteudo(membroB, x.id)).concluido)).toBe(0);
  });
  it("não favorita conteúdo que não enxerga", async () => {
    const [x] = await query<any>("SELECT id FROM conteudos WHERE titulo = 'Formação só do A'");
    await expect(alternarFavorito(membroB, x.id)).rejects.toThrow(NotFoundError);
  });
  it("paginação", async () => {
    for (let i = 0; i < 22; i++) await criarConteudo(com, c({ titulo: `Item ${i}` }));
    const p1 = await listarConteudos(sem, { page: 1 }); const p2 = await listarConteudos(sem, { page: 2 });
    expect(p1.itens).toHaveLength(20); expect(p2.itens.length).toBeGreaterThan(0); expect(p1.total).toBeGreaterThan(20);
  });
});

describe("trilhas formativas", () => {
  let aberto = 0, doA = 0, doB = 0, trilha = 0;
  beforeAll(async () => {
    aberto = await criarConteudo(com, c({ titulo: "T1 aberto" })); doA = await criarConteudo(coordA, c({ unitId: String(A), titulo: "T2 do A" }));
    doB = await criarConteudo(admin, c({ unitId: String(B), titulo: "T3 do B" }));
  });
  it("trilha só inclui conteúdo da mesma estrutura ou aberto (sem vazamento entre estruturas)", async () => {
    await expect(criarTrilha(coordA, trilhaSchema.parse({ titulo: "Trilha do A", unitId: String(A) }), [aberto, doB])).rejects.toThrow(DomainError);
    trilha = await criarTrilha(coordA, trilhaSchema.parse({ titulo: "Trilha do A", unitId: String(A) }), [aberto, doA]);
    await expect(criarTrilha(membroA, trilhaSchema.parse({ titulo: "Trilha X", unitId: String(A) }), [aberto])).rejects.toThrow(ForbiddenError);
    expect(await query<any>("SELECT id FROM trilhas WHERE titulo = 'Trilha do A'")).toHaveLength(1); // transação desfez a falha
  });
  it("visibilidade e progresso pessoal", async () => {
    expect((await listarTrilhas(membroA)).map((t) => t.titulo)).toEqual(["Trilha do A"]);
    expect(await listarTrilhas(membroB)).toEqual([]);
    await expect(getTrilha(membroB, trilha)).rejects.toThrow(NotFoundError);
    await alternarConcluido(membroA, aberto);
    const t = (await listarTrilhas(membroA))[0];
    expect([Number(t.total), Number(t.feitos)]).toEqual([2, 1]);
    expect(((await getTrilha(membroA, trilha)).itens).map((i) => i.titulo)).toEqual(["T1 aberto", "T2 do A"]);
  });
  it("excluir exige permissão", async () => {
    await expect(excluirTrilha(membroA, trilha)).rejects.toThrow(ForbiddenError);
    await excluirTrilha(coordA, trilha);
    expect(await listarTrilhas(membroA)).toEqual([]);
  });
});
