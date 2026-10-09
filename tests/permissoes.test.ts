import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { can, accessibleUnitIds, assertCan, ForbiddenError } from "@/lib/permissions";
import { closePool, execute } from "@/lib/db";
import { resetTestDb, criarUsuario, criarUnidade, darPapel, vincular } from "./helpers";

let admin = 0, coordMusica = 0, coordCaminho = 0, membroMusica = 0, financeiro = 0, semNada = 0;
let caminhoA = 0, caminhoB = 0, musica = 0, coral = 0, liturgia = 0, servicoAcolhida = 0;

beforeAll(async () => {
  await resetTestDb();
  caminhoA = await criarUnidade("caminho", "Caminho A");
  caminhoB = await criarUnidade("caminho", "Caminho B");
  musica = await criarUnidade("ministerio", "Música", caminhoA);
  coral = await criarUnidade("grupo", "Coral", musica);
  liturgia = await criarUnidade("ministerio", "Liturgia", caminhoB);
  servicoAcolhida = await criarUnidade("servico", "Acolhida", caminhoB);
  admin = await criarUsuario("admin@t.com");
  coordMusica = await criarUsuario("cm@t.com");
  coordCaminho = await criarUsuario("cc@t.com");
  membroMusica = await criarUsuario("mm@t.com");
  financeiro = await criarUsuario("fin@t.com");
  semNada = await criarUsuario("nada@t.com");
  await darPapel(admin, "admin_geral");
  await darPapel(coordMusica, "coord_ministerio", musica);
  await darPapel(coordCaminho, "coord_caminho", caminhoA);
  await darPapel(financeiro, "resp_financeiro");
  await vincular(membroMusica, musica);
});
afterAll(closePool);

describe("RBAC com escopo", () => {
  it("nega por padrão", async () => {
    expect(await can(semNada, "eventos", "ver", musica)).toBe(false);
    expect(await can(semNada, "eventos", "ver")).toBe(false);
  });
  it("administrador geral acessa tudo, inclusive financeiro e permissões", async () => {
    expect(await can(admin, "financeiro", "ver")).toBe(true);
    expect(await can(admin, "eventos", "permissoes", liturgia)).toBe(true);
  });
  it("coordenador de ministério administra o próprio ministério e descendentes", async () => {
    expect(await can(coordMusica, "eventos", "criar", musica)).toBe(true);
    expect(await can(coordMusica, "escalas", "editar", coral)).toBe(true);
  });
  it("coordenador de ministério NÃO acessa outro ministério, outro caminho ou serviço alheio", async () => {
    expect(await can(coordMusica, "eventos", "ver", liturgia)).toBe(false);
    expect(await can(coordMusica, "eventos", "ver", caminhoB)).toBe(false);
    expect(await can(coordMusica, "escalas", "editar", servicoAcolhida)).toBe(false);
  });
  it("não sobe na hierarquia: coordenação do ministério não vale para o caminho pai", async () => {
    expect(await can(coordMusica, "eventos", "ver", caminhoA)).toBe(false);
  });
  it("coordenador de caminho alcança seus ministérios e grupos, mas não o outro caminho", async () => {
    expect(await can(coordCaminho, "tarefas", "criar", coral)).toBe(true);
    expect(await can(coordCaminho, "tarefas", "criar", liturgia)).toBe(false);
  });
  it("coordenação não gerencia permissões nem vê o financeiro", async () => {
    expect(await can(coordMusica, "eventos", "permissoes", musica)).toBe(false);
    expect(await can(coordCaminho, "financeiro", "ver", caminhoA)).toBe(false);
    expect(await can(coordCaminho, "financeiro", "ver")).toBe(false);
  });
  it("financeiro é independente: não enxerga estruturas, e coordenadores não enxergam o financeiro", async () => {
    expect(await can(financeiro, "financeiro", "ver")).toBe(true);
    expect(await can(financeiro, "eventos", "ver", musica)).toBe(false);
    expect(await can(financeiro, "financeiro", "excluir")).toBe(false);
  });
  it("integrante apenas visualiza a própria estrutura", async () => {
    expect(await can(membroMusica, "eventos", "ver", musica)).toBe(true);
    expect(await can(membroMusica, "eventos", "criar", musica)).toBe(false);
    expect(await can(membroMusica, "eventos", "ver", liturgia)).toBe(false);
    expect(await can(membroMusica, "eventos", "ver", coral)).toBe(false);
    expect(await can(membroMusica, "financeiro", "ver", musica)).toBe(false);
    expect(await can(membroMusica, "membros", "ver", musica)).toBe(false);
  });
  it("papel com escopo ignorado quando consultado sem estrutura", async () => {
    expect(await can(coordMusica, "eventos", "ver")).toBe(false);
  });
  it("revogação do vínculo tem efeito imediato", async () => {
    await execute("UPDATE memberships SET fim = '2020-12-31' WHERE user_id = ?", [membroMusica]);
    expect(await can(membroMusica, "eventos", "ver", musica)).toBe(false);
    await execute("UPDATE memberships SET fim = NULL WHERE user_id = ?", [membroMusica]);
    expect(await can(membroMusica, "eventos", "ver", musica)).toBe(true);
  });
  it("remover o papel revoga o acesso imediatamente", async () => {
    await execute("DELETE FROM user_roles WHERE user_id = ?", [coordMusica]);
    expect(await can(coordMusica, "eventos", "criar", musica)).toBe(false);
    await darPapel(coordMusica, "coord_ministerio", musica);
  });
  it("acumular funções não amplia o acesso além da soma exata", async () => {
    await darPapel(coordMusica, "resp_servico", servicoAcolhida);
    expect(await can(coordMusica, "escalas", "editar", servicoAcolhida)).toBe(true);
    expect(await can(coordMusica, "membros", "editar", servicoAcolhida)).toBe(false);
    expect(await can(coordMusica, "escalas", "editar", liturgia)).toBe(false);
  });
  it("assertCan lança ForbiddenError", async () => {
    await expect(assertCan(semNada, "eventos", "ver", musica)).rejects.toThrow(ForbiddenError);
  });
  it("accessibleUnitIds devolve só o escopo permitido", async () => {
    expect(await accessibleUnitIds(admin, "eventos", "ver")).toBe("todas");
    expect((await accessibleUnitIds(coordCaminho, "eventos", "ver") as number[]).sort()).toEqual([caminhoA, musica, coral].sort());
    expect(await accessibleUnitIds(membroMusica, "eventos", "ver")).toEqual([musica]);
    expect(await accessibleUnitIds(membroMusica, "financeiro", "ver")).toEqual([]);
    expect(await accessibleUnitIds(semNada, "eventos", "ver")).toEqual([]);
  });
});
