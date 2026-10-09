import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { closePool, query } from "@/lib/db";
import { can, ForbiddenError } from "@/lib/permissions";
import {
  addMember, createUnit, deactivateUnit, endMembership, getUnit, listUnitMembers, listUnits, moveUnit, transferMember,
} from "@/lib/services/estruturas";
import { assignRole, revokeRole } from "@/lib/services/papeis";
import { DomainError, NotFoundError } from "@/lib/services/errors";
import { resetTestDb, criarUsuario, criarUnidade, darPapel, vincular } from "./helpers";

let admin = 0, coordA = 0, coordB = 0, membro = 0, outro = 0, A = 0, B = 0, musicaA = 0, liturgiaB = 0;

beforeAll(async () => {
  await resetTestDb();
  admin = await criarUsuario("a@t.com"); coordA = await criarUsuario("ca@t.com"); coordB = await criarUsuario("cb@t.com");
  membro = await criarUsuario("m@t.com"); outro = await criarUsuario("o@t.com");
  await darPapel(admin, "admin_geral");
  A = await criarUnidade("caminho", "A"); B = await criarUnidade("caminho", "B");
  musicaA = await criarUnidade("ministerio", "Música", A); liturgiaB = await criarUnidade("ministerio", "Liturgia", B);
  await darPapel(coordA, "coord_caminho", A); await darPapel(coordB, "coord_caminho", B);
  await vincular(membro, musicaA);
});
afterAll(closePool);

describe("estruturas", () => {
  it("lista apenas a estrutura da coordenação e as descendentes", async () => {
    expect((await listUnits(coordA)).map((u) => u.id).sort()).toEqual([A, musicaA].sort());
    expect((await listUnits(admin)).length).toBe(4);
    expect(await listUnits(outro)).toEqual([]);
  });
  it("URL direta de estrutura alheia vira 'não encontrado'", async () => {
    await expect(getUnit(coordA, liturgiaB)).rejects.toThrow(NotFoundError);
    await expect(getUnit(membro, musicaA)).rejects.toThrow(NotFoundError); // integrante não vê a gestão
    await expect(getUnit(outro, A)).rejects.toThrow(NotFoundError);
  });
  it("criar nível principal exige papel global; subordinada exige permissão no pai", async () => {
    await expect(createUnit(coordA, { tipo: "caminho", nome: "X", descricao: null, parentId: null })).rejects.toThrow(ForbiddenError);
    await expect(createUnit(coordA, { tipo: "grupo", nome: "Coral", descricao: null, parentId: liturgiaB })).rejects.toThrow(ForbiddenError);
    const id = await createUnit(coordA, { tipo: "grupo", nome: "Coral", descricao: null, parentId: musicaA });
    expect(id).toBeGreaterThan(0);
    expect(await can(coordA, "eventos", "criar", id)).toBe(true); // herda a coordenação do caminho
    expect(await can(coordB, "eventos", "ver", id)).toBe(false);
  });
  it("impede ciclos e mover para fora do próprio escopo", async () => {
    await expect(moveUnit(admin, A, musicaA)).rejects.toThrow(DomainError);
    await expect(moveUnit(coordA, musicaA, liturgiaB)).rejects.toThrow(ForbiddenError);
  });
  it("não desativa estrutura com subordinadas ativas; desativa sem apagar histórico", async () => {
    await expect(deactivateUnit(admin, musicaA)).rejects.toThrow(DomainError);
    const t = await createUnit(admin, { tipo: "servico", nome: "Temp", descricao: null, parentId: A });
    await deactivateUnit(admin, t);
    expect((await query<any>("SELECT ativo FROM org_units WHERE id = ?", [t]))[0].ativo).toBe(0);
  });
});

describe("vínculos", () => {
  it("coordenador só gerencia integrantes da própria estrutura", async () => {
    await expect(addMember(coordA, liturgiaB, outro, null)).rejects.toThrow(ForbiddenError);
    await addMember(coordA, musicaA, outro, "Violão");
    await expect(addMember(coordA, musicaA, outro, null)).rejects.toThrow(DomainError); // duplicado
  });
  it("integrante comum não gerencia integrantes nem vê a lista de membros", async () => {
    await expect(addMember(membro, musicaA, coordB, null)).rejects.toThrow(ForbiddenError);
    await expect(listUnitMembers(membro, musicaA)).rejects.toThrow(ForbiddenError);
    expect((await listUnitMembers(coordA, musicaA)).map((m) => m.user_id).sort()).toEqual([membro, outro].sort());
  });
  it("encerrar vínculo revoga o acesso imediatamente e mantém histórico", async () => {
    expect(await can(outro, "eventos", "ver", musicaA)).toBe(true);
    const [m] = await query<any>("SELECT id FROM memberships WHERE user_id = ? AND unit_id = ?", [outro, musicaA]);
    await expect(endMembership(coordB, m.id)).rejects.toThrow(ForbiddenError);
    await endMembership(coordA, m.id);
    expect(await can(outro, "eventos", "ver", musicaA)).toBe(false);
    expect((await listUnitMembers(coordA, musicaA, true)).some((x) => x.user_id === outro && x.fim)).toBe(true);
  });
  it("transfere entre estruturas: encerra a origem e abre o destino, exigindo permissão nas duas", async () => {
    await expect(transferMember(coordA, membro, musicaA, liturgiaB, null)).rejects.toThrow(ForbiddenError);
    await transferMember(admin, membro, musicaA, liturgiaB, null);
    expect(await can(membro, "eventos", "ver", musicaA)).toBe(false);
    expect(await can(membro, "eventos", "ver", liturgiaB)).toBe(true);
  });
});

describe("papéis", () => {
  it("só quem tem permissão no escopo atribui; coordenação não promove ninguém", async () => {
    await expect(assignRole(coordA, outro, "coord_ministerio", musicaA)).rejects.toThrow(ForbiddenError);
    await assignRole(admin, outro, "coord_ministerio", musicaA);
    expect(await can(outro, "tarefas", "criar", musicaA)).toBe(true);
  });
  it("valida combinação global/escopo", async () => {
    await expect(assignRole(admin, outro, "resp_financeiro", musicaA)).rejects.toThrow(DomainError);
    await expect(assignRole(admin, outro, "coord_grupo", null)).rejects.toThrow(DomainError);
    await expect(assignRole(admin, outro, "inexistente", null)).rejects.toThrow(DomainError);
  });
  it("revogar tem efeito imediato e o último admin não pode se remover", async () => {
    const [r] = await query<any>("SELECT id FROM user_roles WHERE user_id = ?", [outro]);
    await revokeRole(admin, r.id);
    expect(await can(outro, "tarefas", "criar", musicaA)).toBe(false);
    const [a] = await query<any>("SELECT id FROM user_roles WHERE user_id = ?", [admin]);
    await expect(revokeRole(admin, a.id)).rejects.toThrow(DomainError);
  });
});
