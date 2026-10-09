import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { closePool, execute, query } from "@/lib/db";
import { can, ForbiddenError } from "@/lib/permissions";
import {
  acceptInvitation, approveUser, createInvitation, getPerson, getValidInvitation, listPeople, listPending, rejectUser, setUserStatus,
} from "@/lib/services/membros";
import { adminCreateReset, isResetTokenValid, requestPasswordReset, resetPassword } from "@/lib/services/senha";
import { authenticate } from "@/lib/auth/login";
import { hashPassword } from "@/lib/auth/password";
import { DomainError, NotFoundError } from "@/lib/services/errors";
import { resetTestDb, criarUsuario, criarUnidade, darPapel, vincular } from "./helpers";

let admin = 0, coordA = 0, coordB = 0, membro = 0, A = 0, B = 0;
const SENHA = "Senha-Valida-123";

beforeAll(async () => {
  await resetTestDb();
  admin = await criarUsuario("admin@t.com", "Admin"); coordA = await criarUsuario("ca@t.com", "Coord A");
  coordB = await criarUsuario("cb@t.com", "Coord B"); membro = await criarUsuario("m@t.com", "Maria Membro");
  await darPapel(admin, "admin_geral");
  A = await criarUnidade("ministerio", "A"); B = await criarUnidade("ministerio", "B");
  await darPapel(coordA, "coord_ministerio", A); await darPapel(coordB, "coord_ministerio", B);
  await vincular(membro, A);
});
afterAll(closePool);

describe("convite e aprovação", () => {
  let token = "", novo = 0;
  it("coordenador só convida para a própria estrutura", async () => {
    await expect(createInvitation(coordA, { nome: "Zé", email: "ze@t.com", unitId: B, funcao: null })).rejects.toThrow(ForbiddenError);
    await expect(createInvitation(coordA, { nome: "Zé", email: "ze@t.com", unitId: null, funcao: null })).rejects.toThrow(ForbiddenError);
    const inv = await createInvitation(coordA, { nome: "Zé", email: "ze@t.com", unitId: A, funcao: "Cantor" });
    token = inv.token;
    expect(await getValidInvitation(token)).toMatchObject({ email: "ze@t.com" });
  });
  it("o token não é guardado em texto simples", async () => {
    const rows = await query<any>("SELECT token_hash FROM invitations");
    expect(rows.every((r: any) => r.token_hash !== token && r.token_hash.length === 64)).toBe(true);
  });
  it("não convida e-mail já cadastrado", async () => {
    await expect(createInvitation(coordA, { nome: "M", email: "m@t.com", unitId: A, funcao: null })).rejects.toThrow(DomainError);
  });
  it("aceite cria usuário PENDENTE que não consegue entrar", async () => {
    novo = await acceptInvitation(token, SENHA, "1.1.1.1");
    expect((await query<any>("SELECT status FROM users WHERE id = ?", [novo]))[0].status).toBe("pendente");
    expect(await authenticate("ze@t.com", SENHA, "9.9.9.1")).toEqual({ ok: false, motivo: "credenciais" });
  });
  it("convite só pode ser usado uma vez", async () => {
    expect(await getValidInvitation(token)).toBeNull();
    await expect(acceptInvitation(token, SENHA, null)).rejects.toThrow(DomainError);
  });
  it("convite expirado ou inventado é recusado", async () => {
    const inv = await createInvitation(admin, { nome: "Exp", email: "exp@t.com", unitId: null, funcao: null });
    await execute("UPDATE invitations SET expira_em = DATE_SUB(UTC_TIMESTAMP(), INTERVAL 1 MINUTE) WHERE email = 'exp@t.com'");
    await expect(acceptInvitation(inv.token, SENHA, null)).rejects.toThrow(DomainError);
    expect(await getValidInvitation("inventado")).toBeNull();
  });
  it("só quem tem escopo vê e decide o pendente", async () => {
    expect((await listPending(coordA)).map((p) => p.id)).toEqual([novo]);
    expect(await listPending(coordB)).toEqual([]);
    expect(await listPending(membro)).toEqual([]);
    await expect(approveUser(coordB, novo)).rejects.toThrow(NotFoundError);
    await expect(approveUser(membro, novo)).rejects.toThrow();
  });
  it("aprovação ativa, cria o vínculo e libera o login", async () => {
    await approveUser(coordA, novo);
    expect(await can(novo, "eventos", "ver", A)).toBe(true);
    expect(await authenticate("ze@t.com", SENHA, "9.9.9.2")).toEqual({ ok: true, userId: novo });
    await expect(approveUser(coordA, novo)).rejects.toThrow(NotFoundError); // já aprovado
  });
  it("recusa mantém o usuário sem acesso", async () => {
    const inv = await createInvitation(coordA, { nome: "Rec", email: "rec@t.com", unitId: A, funcao: null });
    const id = await acceptInvitation(inv.token, SENHA, null);
    await rejectUser(coordA, id);
    expect(await authenticate("rec@t.com", SENHA, "9.9.9.3")).toEqual({ ok: false, motivo: "credenciais" });
    expect(await can(id, "eventos", "ver", A)).toBe(false);
  });
});

describe("privacidade dos membros", () => {
  it("lista só pessoas das estruturas autorizadas", async () => {
    const a = await listPeople(coordA); const b = await listPeople(coordB);
    expect(a.itens.map((p) => p.id).sort()).toEqual([membro, (await query<any>("SELECT id FROM users WHERE email='ze@t.com'"))[0].id].sort());
    expect(b.itens).toEqual([]);
    expect((await listPeople(membro)).itens).toEqual([]); // integrante comum não vê contatos
    expect((await listPeople(admin)).total).toBeGreaterThanOrEqual(4);
  });
  it("busca não aceita injeção e filtra por nome", async () => {
    expect((await listPeople(admin, { q: "Maria" })).itens.map((p) => p.nome)).toEqual(["Maria Membro"]);
    expect((await listPeople(admin, { q: "' OR 1=1 --" })).itens).toEqual([]);
    expect((await listPeople(admin, { q: "%" })).itens).toEqual([]);
  });
  it("perfil de pessoa alheia só abre dentro do escopo", async () => {
    await expect(getPerson(coordB, membro)).rejects.toThrow(NotFoundError);
    expect((await getPerson(coordA, membro)).pessoa.nome).toBe("Maria Membro");
    expect((await getPerson(membro, membro)).pessoa.id).toBe(membro);
    await expect(getPerson(membro, coordA)).rejects.toThrow(NotFoundError);
  });
  it("suspensão é restrita a papel global e encerra sessões", async () => {
    await expect(setUserStatus(coordA, membro, "suspenso")).rejects.toThrow(ForbiddenError);
    await execute("INSERT INTO sessions (user_id, token_hash, expira_em) VALUES (?, 'h1', DATE_ADD(UTC_TIMESTAMP(), INTERVAL 1 DAY))", [membro]);
    await setUserStatus(admin, membro, "suspenso");
    expect((await query<any>("SELECT revogada_em FROM sessions WHERE token_hash='h1'"))[0].revogada_em).not.toBeNull();
    await setUserStatus(admin, membro, "ativo");
  });
});

describe("recuperação de senha", () => {
  let uid = 0;
  beforeAll(async () => {
    uid = await criarUsuario("rec2@t.com", "Rec");
    await execute("UPDATE users SET senha_hash = ? WHERE id = ?", [await hashPassword("SenhaAntiga123"), uid]);
  });
  it("pedido para e-mail inexistente não falha nem revela nada", async () => {
    await expect(requestPasswordReset("naoexiste@t.com", "http://x", null)).resolves.toBeUndefined();
  });
  it("limita pedidos por hora", async () => {
    for (let i = 0; i < 6; i++) await requestPasswordReset("rec2@t.com", "http://x", null);
    const n = await query<any>("SELECT COUNT(*) n FROM password_resets WHERE user_id = ?", [uid]);
    expect(Number(n[0].n)).toBe(3);
  });
  it("somente administrador global gera link manual", async () => {
    await expect(adminCreateReset(coordA, uid)).rejects.toThrow(ForbiddenError);
  });
  it("redefine uma única vez, troca a senha e derruba as sessões", async () => {
    const token = await adminCreateReset(admin, uid);
    await execute("INSERT INTO sessions (user_id, token_hash, expira_em) VALUES (?, 'h2', DATE_ADD(UTC_TIMESTAMP(), INTERVAL 1 DAY))", [uid]);
    expect(await isResetTokenValid(token)).toBe(true);
    await resetPassword(token, "NovaSenha12345", null);
    expect(await isResetTokenValid(token)).toBe(false);
    await expect(resetPassword(token, "OutraSenha12345", null)).rejects.toThrow(DomainError);
    expect((await query<any>("SELECT revogada_em FROM sessions WHERE token_hash='h2'"))[0].revogada_em).not.toBeNull();
    expect(await authenticate("rec2@t.com", "SenhaAntiga123", "8.8.8.1")).toEqual({ ok: false, motivo: "credenciais" });
    expect(await authenticate("rec2@t.com", "NovaSenha12345", "8.8.8.2")).toEqual({ ok: true, userId: uid });
  });
  it("token expirado ou inventado é recusado", async () => {
    const token = await adminCreateReset(admin, uid);
    await execute("UPDATE password_resets SET expira_em = DATE_SUB(UTC_TIMESTAMP(), INTERVAL 1 MINUTE)");
    expect(await isResetTokenValid(token)).toBe(false);
    await expect(resetPassword(token, "NovaSenha12345", null)).rejects.toThrow(DomainError);
    expect(await isResetTokenValid("qualquer")).toBe(false);
  });
});
