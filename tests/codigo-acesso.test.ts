import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { execute, query, closePool } from "@/lib/db";
import { ForbiddenError } from "@/lib/permissions";
import { DomainError } from "@/lib/services/errors";
import { autenticarCodigo, definirModoLogin, emitirCodigo, formatarCodigo, gerarCodigo, hmacCodigo, modoLogin, normalizarCodigo, revogarCodigo, MAX_FALHAS_IP_CODIGO } from "@/lib/auth/codigo";
import { alterarSituacao } from "@/lib/services/equipe";
import { userFromToken, __test } from "@/lib/auth/session";
import { equipePadrao, resetTestDb } from "./helpers";

let e: Awaited<ReturnType<typeof equipePadrao>>;
const semEspera = async () => {};
beforeAll(async () => { await resetTestDb(); e = await equipePadrao(); });
afterAll(closePool);
beforeEach(async () => { await execute("DELETE FROM login_attempts"); });

describe("formato do código", () => {
  it("gera 8 caracteres sem 0/O/1/I/L, normaliza e aceita minúsculas, espaço e hífen", () => {
    for (let i = 0; i < 200; i++) { const c = gerarCodigo(); expect(c).toMatch(/^[2-9A-HJKMNP-Z]{8}$/); expect(normalizarCodigo(c)).toBe(c); }
    expect(normalizarCodigo(" k7m2-9qxp ")).toBe("K7M29QXP");
    expect(normalizarCodigo("K7M2-9QX")).toBeNull(); expect(normalizarCodigo("K7M2-9QXO")).toBeNull(); expect(normalizarCodigo("")).toBeNull();
    expect(formatarCodigo("K7M29QXP")).toBe("K7M2-9QXP");
  });
  it("o HMAC depende do SESSION_SECRET e nunca é o código", () => {
    const a = hmacCodigo("K7M29QXP"); expect(a).toMatch(/^[0-9a-f]{64}$/); expect(a).not.toContain("K7M2");
    const antes = process.env.SESSION_SECRET; process.env.SESSION_SECRET = "outro-segredo-outro-segredo-outro-segredo-12345";
    expect(hmacCodigo("K7M29QXP")).not.toBe(a); process.env.SESSION_SECRET = antes;
    process.env.SESSION_SECRET = "curto"; expect(() => hmacCodigo("K7M29QXP")).toThrow(); process.env.SESSION_SECRET = antes;
  });
});

describe("emitir e entrar com o código", () => {
  it("só quem gerencia a equipe emite; o código é mostrado uma vez e só o HMAC fica no banco", async () => {
    await expect(emitirCodigo(e.integ, e.coord)).rejects.toBeInstanceOf(ForbiddenError);
    const r = await emitirCodigo(e.admin, e.coord);
    expect(r.codigo).toMatch(/^[2-9A-Z]{4}-[2-9A-Z]{4}$/);
    const linha = (await query<any>("SELECT acesso_hmac FROM users WHERE id = ?", [e.coord]))[0];
    expect(linha.acesso_hmac).toBe(hmacCodigo(normalizarCodigo(r.codigo)!));
    expect(JSON.stringify(await query<any>("SELECT * FROM users WHERE id = ?", [e.coord]))).not.toContain(r.codigo.replace("-", ""));
  });
  it("entra com o código certo (qualquer caixa/hífen), registra auditoria e recusa o errado com a mesma resposta", async () => {
    const { codigo } = await emitirCodigo(e.admin, e.integ);
    expect(await autenticarCodigo(codigo.toLowerCase(), "10.0.0.1", semEspera)).toEqual({ ok: true, userId: e.integ });
    expect(await autenticarCodigo(codigo.replace("-", ""), "10.0.0.1", semEspera)).toEqual({ ok: true, userId: e.integ });
    for (const ruim of ["AAAA-AAAA", "", "curto", codigo + "X"]) expect(await autenticarCodigo(ruim, "10.0.0.2", semEspera)).toEqual({ ok: false, motivo: "codigo" });
    const acoes = new Set((await query<any>("SELECT acao FROM audit_log WHERE acao LIKE 'login.%' OR acao LIKE 'acesso.%'")).map((r: any) => r.acao));
    expect(acoes.has("login.sucesso") && acoes.has("login.falha") && acoes.has("acesso.codigo_gerado")).toBe(true);
  });
  it("gerar outro código encerra os acessos anteriores e invalida o código antigo", async () => {
    const antigo = (await emitirCodigo(e.admin, e.aprov)).codigo;
    const token = "tok-" + Math.random().toString(36).slice(2);
    await execute("INSERT INTO sessions (user_id, token_hash, expira_em) VALUES (?, ?, DATE_ADD(UTC_TIMESTAMP(), INTERVAL 1 DAY))", [e.aprov, __test.sha256(token)]);
    expect((await userFromToken(token))?.id).toBe(e.aprov);
    const novo = (await emitirCodigo(e.admin, e.aprov)).codigo;
    expect(novo).not.toBe(antigo);
    expect(await userFromToken(token)).toBeNull();
    expect(await autenticarCodigo(antigo, "10.0.0.3", semEspera)).toMatchObject({ ok: false });
    expect(await autenticarCodigo(novo, "10.0.0.3", semEspera)).toMatchObject({ ok: true });
  });
  it("revogar o código impede a entrada; pessoa suspensa não entra nem recebe código", async () => {
    const { codigo } = await emitirCodigo(e.admin, e.integ2);
    await revogarCodigo(e.admin, e.integ2);
    expect(await autenticarCodigo(codigo, "10.0.0.4", semEspera)).toMatchObject({ ok: false });
    const c2 = (await emitirCodigo(e.admin, e.integ2)).codigo;
    await alterarSituacao(e.admin, e.integ2, "suspenso");
    expect(await autenticarCodigo(c2, "10.0.0.4", semEspera)).toMatchObject({ ok: false });
    await expect(emitirCodigo(e.admin, e.integ2)).rejects.toBeInstanceOf(DomainError);
    await alterarSituacao(e.admin, e.integ2, "ativo");
  });
});

describe("proteção contra adivinhação", () => {
  it("bloqueia o endereço após muitas falhas, mesmo com o código certo; outro endereço segue livre", async () => {
    const { codigo } = await emitirCodigo(e.admin, e.coord);
    for (let i = 0; i < MAX_FALHAS_IP_CODIGO; i++) await autenticarCodigo("AAAA-AAAA", "10.9.9.9", semEspera);
    expect(await autenticarCodigo(codigo, "10.9.9.9", semEspera)).toEqual({ ok: false, motivo: "bloqueado" });
    expect(await autenticarCodigo(codigo, "10.9.9.10", semEspera)).toMatchObject({ ok: true });
  });
  it("aplica atraso crescente após falhas", async () => {
    const esperas: number[] = [];
    for (let i = 0; i < 3; i++) await autenticarCodigo("AAAA-AAAA", "10.8.8.8", async (ms) => { esperas.push(ms); });
    expect(esperas).toEqual([300, 600]); // 1ª tentativa sem atraso
  });
});

describe("forma de entrada", () => {
  it("só dá para ficar 'somente código' se quem altera já tem o próprio código; só quem gerencia configurações altera", async () => {
    expect(await modoLogin()).toBe("ambos");
    await expect(definirModoLogin(e.coord, "codigo")).rejects.toBeInstanceOf(ForbiddenError);
    await execute("UPDATE users SET acesso_hmac = NULL WHERE id = ?", [e.admin]);
    await expect(definirModoLogin(e.admin, "codigo")).rejects.toBeInstanceOf(DomainError);
    await emitirCodigo(e.admin, e.admin);
    await definirModoLogin(e.admin, "codigo");
    expect(await modoLogin()).toBe("codigo");
    await definirModoLogin(e.admin, "ambos");
  });
});
