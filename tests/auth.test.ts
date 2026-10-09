import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { authenticate } from "@/lib/auth/login";
import { loginSchema, senhaNovaSchema } from "@/lib/validation/auth";
import { userFromToken, __test } from "@/lib/auth/session";
import { execute, closePool } from "@/lib/db";
import { resetTestDb } from "./helpers";

const SENHA = "Senha-Correta-123";
let uid = 0;

beforeAll(async () => {
  await resetTestDb();
  const hash = await hashPassword(SENHA);
  const r = await execute("INSERT INTO users (nome, email, senha_hash, status) VALUES ('Maria Teste','maria@ex.com',?, 'ativo')", [hash]);
  uid = r.insertId;
  await execute("INSERT INTO users (nome, email, senha_hash, status) VALUES ('Suspenso','susp@ex.com',?, 'suspenso')", [hash]);
});
afterAll(closePool);

describe("senhas", () => {
  it("usa bcrypt e nunca guarda texto simples", async () => {
    const h = await hashPassword("abc12345678");
    expect(h).not.toContain("abc12345678");
    expect(h.startsWith("$2")).toBe(true);
    expect(await verifyPassword("abc12345678", h)).toBe(true);
    expect(await verifyPassword("outra", h)).toBe(false);
  });
  it("valida política de senha", () => {
    expect(senhaNovaSchema.safeParse("curta1").success).toBe(false);
    expect(senhaNovaSchema.safeParse("somenteletrasaqui").success).toBe(false);
    expect(senhaNovaSchema.safeParse("Letras12345").success).toBe(true);
  });
  it("normaliza e valida o login", () => {
    expect(loginSchema.parse({ email: "  MARIA@Ex.com ", senha: "x" }).email).toBe("maria@ex.com");
    expect(loginSchema.safeParse({ email: "invalido", senha: "x" }).success).toBe(false);
  });
});

describe("login", () => {
  it("autentica com credenciais corretas", async () => {
    const r = await authenticate("maria@ex.com", SENHA, "10.0.0.1");
    expect(r).toEqual({ ok: true, userId: uid });
  });
  it("recusa senha errada, e-mail inexistente e usuário suspenso com a mesma resposta", async () => {
    const a = await authenticate("maria@ex.com", "errada", "10.0.0.2");
    const b = await authenticate("naoexiste@ex.com", "qualquer", "10.0.0.3");
    const c = await authenticate("susp@ex.com", SENHA, "10.0.0.4");
    for (const r of [a, b, c]) expect(r).toEqual({ ok: false, motivo: "credenciais" });
  });
  it("bloqueia após tentativas excessivas, mesmo com a senha certa", async () => {
    for (let i = 0; i < 5; i++) await authenticate("bloq@ex.com", "errada", "10.0.1." + i);
    const r = await authenticate("bloq@ex.com", "errada", "10.0.1.99");
    expect(r).toEqual({ ok: false, motivo: "bloqueado" });
  });
  it("registra auditoria de falha e sucesso", async () => {
    const { query } = await import("@/lib/db");
    const rows = await query<any>("SELECT acao FROM audit_log WHERE acao LIKE 'login.%'");
    const acoes = new Set(rows.map((r: any) => r.acao));
    expect(acoes.has("login.sucesso") && acoes.has("login.falha") && acoes.has("login.bloqueado")).toBe(true);
  });
});

describe("sessões", () => {
  const novo = async (extra = "") => {
    const token = "tok-" + Math.random().toString(36).slice(2);
    await execute(
      `INSERT INTO sessions (user_id, token_hash, expira_em ${extra ? ", revogada_em" : ""}) VALUES (?, ?, DATE_ADD(UTC_TIMESTAMP(), INTERVAL 1 DAY) ${extra ? ", UTC_TIMESTAMP()" : ""})`,
      [uid, __test.sha256(token)],
    );
    return token;
  };
  it("aceita sessão válida", async () => expect((await userFromToken(await novo()))?.id).toBe(uid));
  it("rejeita sessão revogada", async () => expect(await userFromToken(await novo("rev"))).toBeNull());
  it("rejeita sessão expirada", async () => {
    await execute("INSERT INTO sessions (user_id, token_hash, expira_em) VALUES (?, ?, DATE_SUB(UTC_TIMESTAMP(), INTERVAL 1 MINUTE))", [uid, __test.sha256("velho")]);
    expect(await userFromToken("velho")).toBeNull();
  });
  it("rejeita token desconhecido", async () => expect(await userFromToken("inventado")).toBeNull());
  it("revoga imediatamente quando o usuário é suspenso", async () => {
    const t = await novo();
    await execute("UPDATE users SET status='suspenso' WHERE id=?", [uid]);
    expect(await userFromToken(t)).toBeNull();
    await execute("UPDATE users SET status='ativo' WHERE id=?", [uid]);
  });
});
