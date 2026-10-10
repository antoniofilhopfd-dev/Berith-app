import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import mysql from "mysql2/promise";
// @ts-expect-error módulos .mjs de operação (sem tipos)
import { manutencao } from "../scripts/manutencao.mjs";
// @ts-expect-error
import { anonimizar, exportarDados } from "../scripts/lgpd.mjs";
// @ts-expect-error
import { verificar } from "../scripts/verificar-ambiente.mjs";
import { closePool, dbConfig, execute, query } from "@/lib/db";
import { authenticate } from "@/lib/auth/login";
import { can } from "@/lib/permissions";
import { resetTestDb, criarUsuario, criarUnidade, darPapel, vincular } from "./helpers";

let conn: mysql.Connection;
beforeAll(async () => { await resetTestDb(); conn = await mysql.createConnection({ ...dbConfig(), multipleStatements: true }); });
afterAll(async () => { await conn.end(); await closePool(); });

describe("retenção e descarte (LGPD)", () => {
  it("remove apenas dados vencidos e preserva auditoria e financeiro", async () => {
    const u = await criarUsuario("ret@t.com");
    await execute("INSERT INTO sessions (user_id, token_hash, expira_em) VALUES (?, 'velha', DATE_SUB(UTC_TIMESTAMP(), INTERVAL 60 DAY)), (?, 'nova', DATE_ADD(UTC_TIMESTAMP(), INTERVAL 1 DAY))", [u, u]);
    await execute("INSERT INTO login_attempts (email, ip, sucesso, criado_em) VALUES ('a@b.c','1.1.1.1',0, DATE_SUB(UTC_TIMESTAMP(), INTERVAL 40 DAY)), ('a@b.c','1.1.1.1',0, UTC_TIMESTAMP())");
    await execute("INSERT INTO notificacoes (user_id, tipo, titulo, dedupe_key, lida_em) VALUES (?, 'sistema', 'velha lida', 'k1', DATE_SUB(UTC_TIMESTAMP(), INTERVAL 200 DAY)), (?, 'sistema', 'velha não lida', 'k2', NULL), (?, 'sistema', 'recente lida', 'k3', UTC_TIMESTAMP())", [u, u, u]);
    await execute("INSERT INTO audit_log (user_id, acao, criado_em) VALUES (?, 'teste.antiga', DATE_SUB(UTC_TIMESTAMP(), INTERVAL 900 DAY))", [u]);
    const r = await manutencao(conn);
    expect(r).toMatchObject({ sessoes: 1, tentativasLogin: 1, notificacoesLidas: 1 });
    expect((await query<any>("SELECT token_hash FROM sessions")).map((s: any) => s.token_hash)).toEqual(["nova"]);
    expect((await query<any>("SELECT titulo FROM notificacoes ORDER BY id")).map((n: any) => n.titulo)).toEqual(["velha não lida", "recente lida"]);
    expect((await query<any>("SELECT COUNT(*) n FROM audit_log WHERE acao = 'teste.antiga'"))[0].n).toBe(1); // auditoria NÃO é descartada
    expect(await manutencao(conn)).toMatchObject({ sessoes: 0, tentativasLogin: 0, notificacoesLidas: 0 }); // idempotente
  });
  it("remove tokens de senha usados/expirados e convites vencidos não aceitos", async () => {
    const u = await criarUsuario("tok@t.com");
    await execute("INSERT INTO password_resets (user_id, token_hash, expira_em, criado_em) VALUES (?, 'r1', DATE_SUB(UTC_TIMESTAMP(), INTERVAL 59 DAY), DATE_SUB(UTC_TIMESTAMP(), INTERVAL 60 DAY)), (?, 'r2', DATE_ADD(UTC_TIMESTAMP(), INTERVAL 1 HOUR), UTC_TIMESTAMP())", [u, u]);
    await execute("INSERT INTO invitations (email, nome, token_hash, expira_em) VALUES ('v@t.com','V','i1', DATE_SUB(UTC_TIMESTAMP(), INTERVAL 45 DAY)), ('w@t.com','W','i2', DATE_ADD(UTC_TIMESTAMP(), INTERVAL 3 DAY))");
    const r = await manutencao(conn);
    expect(r).toMatchObject({ redefinicoesDeSenha: 1, convitesVencidos: 1 });
    expect((await query<any>("SELECT token_hash FROM password_resets")).map((x: any) => x.token_hash)).toEqual(["r2"]);
  });
});

describe("direitos do titular (LGPD)", () => {
  let membro = 0, admin = 0, U = 0;
  beforeAll(async () => {
    admin = await criarUsuario("adm@t.com", "Admin"); await darPapel(admin, "admin_geral");
    U = await criarUnidade("ministerio", "Música"); membro = await criarUsuario("titular@t.com", "Titular Da Silva"); await vincular(membro, U);
    await execute("INSERT INTO member_profiles (user_id, telefone) VALUES (?, '(11) 90000-0000')", [membro]);
    await execute("INSERT INTO sessions (user_id, token_hash, expira_em) VALUES (?, 'sess-t', DATE_ADD(UTC_TIMESTAMP(), INTERVAL 1 DAY))", [membro]);
    await execute("INSERT INTO push_subscriptions (user_id, endpoint_hash, endpoint, p256dh, auth) VALUES (?, 'h', 'https://x.org/1', 'a', 'b')", [membro]);
    const [conta] = await query<any>("SELECT id FROM fin_contas LIMIT 1"); const [cat] = await query<any>("SELECT id FROM fin_categorias WHERE tipo='entrada' LIMIT 1");
    await execute("INSERT INTO fin_lancamentos (conta_id, categoria_id, tipo, valor_centavos, data, descricao, doador_user_id, status, criado_por) VALUES (?,?, 'entrada', 5000, CURDATE(), 'Contribuição', ?, 'aprovado', ?)", [conta.id, cat.id, membro, admin]);
  });
  it("exportar devolve os dados pessoais da pessoa (e nada de outras)", async () => {
    const d = await exportarDados(conn, "TITULAR@t.com");
    expect(d.pessoa.nome).toBe("Titular Da Silva"); expect(d.perfil.telefone).toBe("(11) 90000-0000");
    expect(d.vinculos.map((v: any) => v.estrutura)).toEqual(["Música"]); expect(d.contribuicoes).toHaveLength(1); expect(d.dispositivosPush).toBe(1);
    expect(JSON.stringify(d)).not.toMatch(/senha_hash|\$2[aby]\$/); expect(JSON.stringify(d)).not.toContain("Admin");
    expect(await exportarDados(conn, "ninguem@t.com")).toBeNull();
  });
  it("anonimizar remove identificação e acesso, mantém registros financeiros e auditoria", async () => {
    expect(await anonimizar(conn, "adm@t.com")).toMatchObject({ ok: false }); // administrador não é anonimizado por engano
    expect(await anonimizar(conn, "ninguem@t.com")).toMatchObject({ ok: false });
    const r = await anonimizar(conn, "titular@t.com"); expect(r.ok).toBe(true);
    const [u] = await query<any>("SELECT nome, email, status, senha_hash FROM users WHERE id = ?", [membro]);
    expect(u.nome).toContain("Membro removido"); expect(u.email).toMatch(/^removido\+\d+@/); expect(u.status).toBe("suspenso"); expect(u.senha_hash).toBe("!");
    for (const t of ["sessions", "push_subscriptions", "member_profiles"]) expect((await query<any>(`SELECT COUNT(*) n FROM ${t} WHERE user_id = ?`, [membro]))[0].n, t).toBe(0);
    expect((await query<any>("SELECT COUNT(*) n FROM fin_lancamentos WHERE doador_user_id = ?", [membro]))[0].n).toBe(1); // obrigação legal
    expect((await query<any>("SELECT COUNT(*) n FROM audit_log WHERE acao = 'lgpd.anonimizar'"))[0].n).toBe(1);
    expect(await can(membro, "eventos", "ver", U)).toBe(false); // vínculo encerrado: sem acesso
    expect(await authenticate("titular@t.com", "qualquer", "9.9.9.9")).toMatchObject({ ok: false });
    expect(await authenticate(u.email, "!", "9.9.9.8")).toMatchObject({ ok: false }); // hash "!" nunca valida
  });
});

describe("primeiro administrador por SQL (sem terminal na hospedagem)", () => {
  it("gera SQL que cria o admin com o hash (nunca a senha) e permite entrar", async () => {
    const senha = "Uma-Senha-Longa-123";
    const sql = execFileSync("node", ["scripts/admin-sql.mjs", "primeiro@t.com", "Primeiro O'Brien"], { env: { ...process.env, ADMIN_SENHA: senha }, encoding: "utf8" });
    expect(sql).not.toContain(senha); expect(sql).toMatch(/\$2[aby]\$12\$/); expect(sql).toContain("O''Brien");
    await conn.query(sql);
    expect(await authenticate("primeiro@t.com", senha, "7.7.7.7")).toMatchObject({ ok: true });
    const [u] = await query<any>("SELECT id FROM users WHERE email = 'primeiro@t.com'");
    expect(await can(u.id, "financeiro", "ver", null)).toBe(true);
  });
  it("recusa senha fraca e não aceita senha como argumento", () => {
    expect(() => execFileSync("node", ["scripts/admin-sql.mjs", "a@b.c", "Nome"], { env: { ...process.env, ADMIN_SENHA: "curta" }, stdio: "pipe" })).toThrow();
    expect(() => execFileSync("node", ["scripts/admin-sql.mjs", "a@b.c", "Nome"], { env: { ...process.env, ADMIN_SENHA: "" }, stdio: "pipe" })).toThrow();
  });
});

describe("verificação de ambiente de produção", () => {
  const bom = { ...process.env, NODE_ENV: "production", SESSION_SECRET: "Zq8vK2mR7xT4pL9wN3cB6yH1jF5dG0sA8eU2iO7aQ4kV9nM3", DB_PASSWORD: "S3nh@-Real-Forte", CRON_SECRET: "x".repeat(30), APP_URL: "https://app.exemplo.org", STORAGE_DIR: "" };
  it("aprova configuração forte e banco migrado", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "nb-ver-")); const r = await verificar({ ...bom, STORAGE_DIR: dir }, { conn });
    expect(r.filter((x: any) => !x.ok && x.critico)).toEqual([]);
    expect(r.find((x: any) => x.nome.startsWith("Migrações aplicadas") && !x.nome.includes("editadas")).ok).toBe(true);
    await rm(dir, { recursive: true, force: true });
  });
  it("reprova segredo curto/de exemplo e senha de exemplo", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "nb-ver-"));
    const r = await verificar({ ...bom, STORAGE_DIR: dir, SESSION_SECRET: "curto", DB_PASSWORD: "troque-esta-senha" }, { conn });
    const falhou = r.filter((x: any) => !x.ok && x.critico).map((x: any) => x.nome);
    expect(falhou).toEqual(expect.arrayContaining(["SESSION_SECRET com 48+ caracteres", "Senha do banco não é a de exemplo"]));
    await rm(dir, { recursive: true, force: true });
  });
  it("detecta migração editada depois de aplicada (checksum divergente)", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "nb-ver-"));
    await execute("UPDATE schema_migrations SET checksum = REPEAT('0', 64) WHERE id = '001_estrutura_inicial'");
    const r = await verificar({ ...bom, STORAGE_DIR: dir }, { conn });
    expect(r.find((x: any) => x.nome.includes("não foram editadas")).ok).toBe(false);
    await rm(dir, { recursive: true, force: true });
  });
  it("não vaza segredos no resultado", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "nb-ver-"));
    const txt = JSON.stringify(await verificar({ ...bom, STORAGE_DIR: dir }, { conn }));
    expect(txt).not.toContain(bom.SESSION_SECRET); expect(txt).not.toContain(bom.DB_PASSWORD); expect(txt).not.toContain(bom.CRON_SECRET);
    await rm(dir, { recursive: true, force: true });
  });
});
