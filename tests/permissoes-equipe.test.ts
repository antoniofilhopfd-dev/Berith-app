import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execute, query, closePool } from "@/lib/db";
import { can, assertCan, ForbiddenError, perfisDe, permissoesDe } from "@/lib/permissions";
import { acceptInvitation, aprovarPessoa, alterarSituacao, criarConvite, definirPerfil, listarEquipe, listarPendentes, rejeitarPessoa } from "@/lib/services/equipe";
import { itensVisiveis } from "@/lib/nav";
import { authenticate } from "@/lib/auth/login";
import { criarUsuario, equipePadrao, resetTestDb, darPerfil } from "./helpers";
import { DomainError } from "@/lib/services/errors";

let e: Awaited<ReturnType<typeof equipePadrao>>;
beforeAll(async () => { await resetTestDb(); e = await equipePadrao(); });
afterAll(closePool);

describe("permissões por perfil (servidor)", () => {
  it("nega tudo a quem não tem perfil", async () => {
    for (const [r, a] of [["producao", "ver"], ["midia", "ver"], ["calendario", "ver"], ["configuracoes", "ver"]] as const) expect(await can(e.semPerfil, r, a)).toBe(false);
    await expect(assertCan(e.semPerfil, "producao", "ver")).rejects.toBeInstanceOf(ForbiddenError);
    expect(await perfisDe(e.semPerfil)).toEqual([]);
  });
  it("administrador tem tudo", async () => {
    for (const r of ["producao", "integracoes", "configuracoes", "auditoria", "equipe"] as const) for (const a of ["ver", "gerir"] as const) expect(await can(e.admin, r, a)).toBe(true);
  });
  it("coordenador planeja, aprova e agenda, mas não gerencia usuários nem integrações", async () => {
    expect(await can(e.coord, "planejamento", "criar")).toBe(true); expect(await can(e.coord, "aprovacao", "aprovar")).toBe(true);
    expect(await can(e.coord, "publicacao", "criar")).toBe(true); expect(await can(e.coord, "relatorios", "exportar")).toBe(true);
    expect(await can(e.coord, "equipe", "ver")).toBe(true);
    expect(await can(e.coord, "equipe", "gerir")).toBe(false); expect(await can(e.coord, "integracoes", "gerir")).toBe(false);
    expect(await can(e.coord, "configuracoes", "gerir")).toBe(false); expect(await can(e.coord, "auditoria", "ver")).toBe(false);
  });
  it("integrante produz e envia mídia, mas não aprova, agenda nem vê relatórios", async () => {
    expect(await can(e.integ, "producao", "criar")).toBe(true); expect(await can(e.integ, "midia", "criar")).toBe(true);
    expect(await can(e.integ, "aprovacao", "aprovar")).toBe(false); expect(await can(e.integ, "publicacao", "criar")).toBe(false);
    expect(await can(e.integ, "relatorios", "ver")).toBe(false); expect(await can(e.integ, "producao", "excluir")).toBe(false);
    expect(await can(e.integ, "equipe", "ver")).toBe(false);
  });
  it("aprovador vê e decide, mas não produz", async () => {
    expect(await can(e.aprov, "aprovacao", "aprovar")).toBe(true); expect(await can(e.aprov, "producao", "ver")).toBe(true);
    expect(await can(e.aprov, "producao", "criar")).toBe(false); expect(await can(e.aprov, "midia", "criar")).toBe(false);
  });
  it("papéis legados da comunidade não concedem nada", async () => {
    const u = await criarUsuario("legado@t.com");
    await execute("INSERT INTO user_roles (user_id, role_id, scope_unit_id, scope_unit_id_key) SELECT ?, id, NULL, 0 FROM roles WHERE codigo = 'admin_geral'", [u]);
    expect(await can(u, "producao", "ver")).toBe(false); expect(await can(u, "midia", "ver")).toBe(false); expect(await can(u, "configuracoes", "gerir")).toBe(false);
    await execute("DELETE FROM users WHERE id = ?", [u]);
  });
  it("usuário suspenso perde o acesso imediatamente", async () => {
    const u = await criarUsuario("susp@t.com"); await darPerfil(u, "coordenador");
    expect(await can(u, "producao", "ver")).toBe(true);
    await execute("UPDATE users SET status = 'suspenso' WHERE id = ?", [u]);
    expect(await can(u, "producao", "ver")).toBe(false);
  });
  it("o menu mostra só o que cada perfil pode abrir", async () => {
    const menu = async (id: number) => itensVisiveis(await permissoesDe(id)).map((i) => i.href);
    expect(await menu(e.semPerfil)).toEqual(["/", "/configuracoes"]);
    expect(await menu(e.integ)).toEqual(expect.arrayContaining(["/producao", "/calendario", "/midia"])); expect(await menu(e.integ)).not.toContain("/aprovacoes");
    expect(await menu(e.aprov)).toContain("/aprovacoes"); expect(await menu(e.aprov)).not.toContain("/relatorios");
    expect(await menu(e.coord)).toEqual(expect.arrayContaining(["/relatorios", "/equipe", "/publicacoes"]));
  });
});

describe("migração dos perfis antigos", () => {
  it("admin_geral vira administrador e resp_comunicacao vira coordenador (sem remover os antigos)", async () => {
    // Simula um banco legado: usuários com os papéis antigos, depois reaplica o trecho de mapeamento da migração 015.
    const a = await criarUsuario("antigo-admin@t.com"), c = await criarUsuario("antigo-com@t.com");
    for (const [u, cod] of [[a, "admin_geral"], [c, "resp_comunicacao"]] as const) await execute("INSERT INTO user_roles (user_id, role_id, scope_unit_id, scope_unit_id_key) SELECT ?, id, NULL, 0 FROM roles WHERE codigo = ?", [u, cod]);
    const { MIGRATIONS } = await import("@/lib/db/migrations.generated");
    const sql = MIGRATIONS.find((m) => m.id.startsWith("015"))!.sql.replace(/^--.*$/gm, "").split(";").map((s) => s.trim()).filter((s) => /^INSERT IGNORE INTO user_roles/.test(s));
    expect(sql).toHaveLength(2);
    for (const s of sql) await execute(s);
    expect(await perfisDe(a)).toEqual(["admin"]); expect(await perfisDe(c)).toEqual(["coordenador"]);
    expect((await query<any>("SELECT COUNT(*) n FROM roles WHERE codigo IN ('admin_geral','resp_comunicacao')"))[0].n).toBe(2);
    await execute("DELETE FROM users WHERE id IN (?, ?)", [a, c]); // não deixa um segundo administrador para os demais testes
  });
});

describe("equipe, convites e aprovação", () => {
  it("só quem gerencia a equipe convida; o convite aceito fica pendente até aprovar", async () => {
    await expect(criarConvite(e.coord, { nome: "Nova Pessoa", email: "nova@t.com", perfil: "integrante" })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(criarConvite(e.admin, { nome: "X", email: "x@t.com", perfil: "dono" as never })).rejects.toBeInstanceOf(DomainError);
    const c = await criarConvite(e.admin, { nome: "Nova Pessoa", email: "nova@t.com", perfil: "integrante" });
    const uid = await acceptInvitation(c.token, "Uma-Senha-Forte-1", "1.1.1.1");
    expect((await authenticate("nova@t.com", "Uma-Senha-Forte-1", "1.1.1.1")).ok).toBe(false); // pendente não entra
    expect((await listarPendentes(e.admin)).map((p) => [p.email, p.perfil])).toEqual([["nova@t.com", "integrante"]]);
    await expect(aprovarPessoa(e.coord, uid)).rejects.toBeInstanceOf(ForbiddenError);
    await aprovarPessoa(e.admin, uid);
    expect(await perfisDe(uid)).toEqual(["integrante"]); expect((await authenticate("nova@t.com", "Uma-Senha-Forte-1", "1.1.1.2")).ok).toBe(true);
    await expect(acceptInvitation(c.token, "Uma-Senha-Forte-1", null)).rejects.toBeInstanceOf(DomainError); // convite de uso único
  });
  it("rejeitar suspende; trocar perfil substitui o anterior", async () => {
    const c = await criarConvite(e.admin, { nome: "Rejeitada", email: "rej@t.com", perfil: "aprovador" });
    const uid = await acceptInvitation(c.token, "Uma-Senha-Forte-2", null);
    await rejeitarPessoa(e.admin, uid);
    expect((await query<any>("SELECT status FROM users WHERE id = ?", [uid]))[0].status).toBe("suspenso");
    await definirPerfil(e.admin, e.integ2, "coordenador"); expect(await perfisDe(e.integ2)).toEqual(["coordenador"]);
    await definirPerfil(e.admin, e.integ2, "nenhum"); expect(await perfisDe(e.integ2)).toEqual([]);
    await definirPerfil(e.admin, e.integ2, "integrante");
  });
  it("protege o último administrador e a própria situação", async () => {
    await expect(definirPerfil(e.admin, e.admin, "coordenador")).rejects.toThrow(/último administrador/);
    await expect(alterarSituacao(e.admin, e.admin, "suspenso")).rejects.toThrow(/própria/);
    const outro = await criarUsuario("outro-admin@t.com"); await darPerfil(outro, "admin");
    await definirPerfil(e.admin, outro, "integrante"); // agora há 1 admin de novo
    await expect(alterarSituacao(e.coord, e.integ, "suspenso")).rejects.toBeInstanceOf(ForbiddenError);
    await alterarSituacao(e.admin, e.integ2, "suspenso");
    expect((await listarEquipe(e.admin)).find((p) => p.id === e.integ2)?.status).toBe("suspenso");
    await alterarSituacao(e.admin, e.integ2, "ativo");
  });
  it("só quem vê a equipe a lista", async () => {
    await expect(listarEquipe(e.integ)).rejects.toBeInstanceOf(ForbiddenError);
    expect((await listarEquipe(e.coord)).length).toBeGreaterThan(3);
  });
});
