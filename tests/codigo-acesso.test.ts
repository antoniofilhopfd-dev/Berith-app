import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { execute, query, closePool } from "@/lib/db";
import { ForbiddenError } from "@/lib/permissions";
import { DomainError } from "@/lib/services/errors";
import { autenticarCodigo, codigosVisiveis, definirCodigo, definirModoLogin, emitirCodigo, formatarCodigo, gerarCodigo, hashDispositivo, hmacCodigo, modoLogin, normalizarCodigo, registrarDispositivo, revogarCodigo, validarCodigoEscolhido, MAX_FALHAS_GLOBAL_CODIGO, MAX_FALHAS_IP_CODIGO } from "@/lib/auth/codigo";
import { alterarSituacao } from "@/lib/services/equipe";
import { anonimizarPessoa, exportarDadosDaPessoa } from "@/lib/services/lgpd";
import { userFromToken, __test } from "@/lib/auth/session";
import { equipePadrao, resetTestDb } from "./helpers";

let e: Awaited<ReturnType<typeof equipePadrao>>;
const semEspera = async () => {};
beforeAll(async () => { process.env.TOKEN_ENC_KEY = "chave-de-teste-para-cifrar-tokens-0123456789"; await resetTestDb(); e = await equipePadrao(); });
afterAll(closePool);
beforeEach(async () => { await execute("DELETE FROM login_attempts"); });

describe("formato do código", () => {
  it("gera 2 letras (sem I/O) + 4 números sem sequências óbvias; normaliza minúsculas, espaço e hífen", () => {
    for (let i = 0; i < 500; i++) { const c = gerarCodigo(); expect(c).toMatch(/^[A-HJ-NP-Z]{2}\d{4}$/); expect(["0000", "1111", "1234", "4321", "9999"]).not.toContain(c.slice(2)); expect(normalizarCodigo(c)).toBe(c); }
    expect(normalizarCodigo(" ab-1357 ")).toBe("AB1357"); expect(normalizarCodigo("ab 1357")).toBe("AB1357");
    for (const ruim of ["", "AB135", "AB1357890123", "AB 1!", "AB13#7"]) expect(normalizarCodigo(ruim)).toBeNull();
    expect(formatarCodigo("AB1357")).toBe("AB1357");
  });
  it("códigos antigos de 8 caracteres continuam sendo aceitos (e aparecem como XXXX-XXXX)", () => {
    expect(normalizarCodigo("k7m2-9qxp")).toBe("K7M29QXP"); expect(normalizarCodigo("K7M2-9QXO")).toBe("K7M29QXO"); expect(normalizarCodigo("K7M2-9Q")).toBe("K7M29Q");
    expect(formatarCodigo("K7M29QXP")).toBe("K7M2-9QXP");
  });
  it("o HMAC depende do SESSION_SECRET e nunca é o código", () => {
    const a = hmacCodigo("AB1357"); expect(a).toMatch(/^[0-9a-f]{64}$/); expect(a).not.toContain("AB13");
    const antes = process.env.SESSION_SECRET; process.env.SESSION_SECRET = "outro-segredo-outro-segredo-outro-segredo-12345";
    expect(hmacCodigo("AB1357")).not.toBe(a); process.env.SESSION_SECRET = antes;
    process.env.SESSION_SECRET = "curto"; expect(() => hmacCodigo("AB1357")).toThrow(); process.env.SESSION_SECRET = antes;
  });
});

describe("emitir e entrar com o código", () => {
  it("só quem gerencia a equipe emite; o código é mostrado uma vez e só o HMAC fica no banco", async () => {
    await expect(emitirCodigo(e.integ, e.coord)).rejects.toBeInstanceOf(ForbiddenError);
    const r = await emitirCodigo(e.admin, e.coord);
    expect(r.codigo).toMatch(/^[A-HJ-NP-Z]{2}\d{4}$/);
    const linha = (await query<any>("SELECT acesso_hmac FROM users WHERE id = ?", [e.coord]))[0];
    expect(linha.acesso_hmac).toBe(hmacCodigo(normalizarCodigo(r.codigo)!));
    expect(JSON.stringify(await query<any>("SELECT * FROM users WHERE id = ?", [e.coord]))).not.toContain(r.codigo.replace("-", ""));
  });
  it("entra com o código certo (qualquer caixa/hífen), registra auditoria e recusa o errado com a mesma resposta", async () => {
    const { codigo } = await emitirCodigo(e.admin, e.integ);
    expect(await autenticarCodigo(codigo.toLowerCase(), "10.0.0.1", semEspera)).toEqual({ ok: true, userId: e.integ });
    expect(await autenticarCodigo(" " + codigo.slice(0, 2) + "-" + codigo.slice(2), "10.0.0.1", semEspera)).toEqual({ ok: true, userId: e.integ });
    for (const ruim of ["ZZ9999", "", "curto", codigo + "X"]) expect(await autenticarCodigo(ruim, "10.0.0.2", semEspera)).toEqual({ ok: false, motivo: "codigo" });
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
    for (let i = 0; i < MAX_FALHAS_IP_CODIGO; i++) await autenticarCodigo("ZZ9999", "10.9.9.9", semEspera);
    expect(await autenticarCodigo(codigo, "10.9.9.9", semEspera)).toEqual({ ok: false, motivo: "bloqueado" });
    expect(await autenticarCodigo(codigo, "10.9.9.10", semEspera)).toMatchObject({ ok: true });
  });
  it("aplica atraso crescente após falhas", async () => {
    const esperas: number[] = [];
    for (let i = 0; i < 3; i++) await autenticarCodigo("ZZ9999", "10.8.8.8", async (ms) => { esperas.push(ms); });
    expect(esperas).toEqual([300, 600]); // 1ª tentativa sem atraso
  });
});

describe("ataque distribuído (muitos endereços): só aparelhos desconhecidos são barrados", () => {
  it("acima do limite global, quem nunca entrou é barrado; aparelho conhecido segue entrando; limite por aparelho não vaza entre pessoas", async () => {
    const { codigo } = await emitirCodigo(e.admin, e.coord);
    const cookie = await registrarDispositivo(e.coord);              // aparelho que já entrou com sucesso
    expect(await registrarDispositivo(e.coord, cookie)).toBe(cookie); // renovar mantém o mesmo cookie
    expect(await registrarDispositivo(e.integ, cookie)).not.toBe(cookie); // cookie de outra pessoa não é reaproveitado
    for (let i = 0; i < MAX_FALHAS_GLOBAL_CODIGO; i++) await execute("INSERT INTO login_attempts (email, ip, sucesso) VALUES ('(código)', ?, 0)", [`172.16.${Math.floor(i / 250)}.${i % 250}`]);
    expect(await autenticarCodigo(codigo, "10.7.7.7", semEspera)).toEqual({ ok: false, motivo: "bloqueado" });
    expect(await autenticarCodigo(codigo, "10.7.7.7", semEspera, hashDispositivo("cookie-inventado"))).toEqual({ ok: false, motivo: "bloqueado" });
    expect(await autenticarCodigo(codigo, "10.7.7.7", semEspera, hashDispositivo(cookie))).toEqual({ ok: true, userId: e.coord });
  });
  it("código antigo de 8 caracteres ainda entra até ser substituído", async () => {
    await execute("UPDATE users SET acesso_hmac = ? WHERE id = ?", [hmacCodigo("K7M29QXP"), e.aprov]);
    expect(await autenticarCodigo("k7m2-9qxp", "10.6.6.6", semEspera)).toEqual({ ok: true, userId: e.aprov });
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

describe("conta do Instagram preferida (seletor do topo)", () => {
  it("fora de uma requisição não há preferência (os serviços caem na conta principal)", async () => {
    const { contaPreferida } = await import("@/lib/auth/conta");
    expect(await contaPreferida()).toBeUndefined();
  });
});

describe("código visível e editável (como no EVO)", () => {
  it("quem gerencia a equipe vê os códigos gerados; o banco guarda o código cifrado, nunca em texto", async () => {
    const { codigo } = await emitirCodigo(e.admin, e.integ);
    expect((await codigosVisiveis(e.admin)).get(e.integ)).toBe(codigo);
    const linha = (await query<any>("SELECT acesso_enc FROM users WHERE id = ?", [e.integ]))[0];
    expect(linha.acesso_enc).not.toContain(codigo);
    await expect(codigosVisiveis(e.integ)).rejects.toBeInstanceOf(ForbiddenError);
    await revogarCodigo(e.admin, e.integ);
    expect((await codigosVisiveis(e.admin)).has(e.integ)).toBe(false);
  });
  it("o administrador define um código específico: valida o formato, evita padrões fracos e códigos repetidos", async () => {
    for (const ruim of ["ab12", "ABCDEF", "123456", "AAAAAA", "AB 12", "ABCDEFGHIJK1", "SENHA123"]) expect(() => validarCodigoEscolhido(ruim)).toThrow(DomainError);
    expect(validarCodigoEscolhido(" jo-2468 ")).toBe("JO2468");
    const r = await definirCodigo(e.admin, e.integ2, "ju4821");
    expect(r.codigo).toBe("JU4821");
    expect((await codigosVisiveis(e.admin)).get(e.integ2)).toBe("JU4821");
    expect(await autenticarCodigo("ju-4821", "10.5.5.5", semEspera)).toEqual({ ok: true, userId: e.integ2 });
    await expect(definirCodigo(e.admin, e.aprov, "JU4821")).rejects.toThrow(/já está em uso/);
    await expect(definirCodigo(e.coord, e.aprov, "XY9876")).rejects.toBeInstanceOf(ForbiddenError);
  });
  it("trocar o código encerra os acessos anteriores da pessoa", async () => {
    const token = "tok-" + Math.random().toString(36).slice(2);
    await execute("INSERT INTO sessions (user_id, token_hash, expira_em) VALUES (?, ?, DATE_ADD(UTC_TIMESTAMP(), INTERVAL 1 DAY))", [e.integ2, __test.sha256(token)]);
    await definirCodigo(e.admin, e.integ2, "ju4822");
    expect(await userFromToken(token)).toBeNull();
  });
});

describe("LGPD pela tela de equipe", () => {
  it("exporta os dados e anonimiza (código, aparelhos e identificação saem); não anonimiza a si mesmo nem administradores", async () => {
    const { codigo } = await emitirCodigo(e.admin, e.aprov);
    await registrarDispositivo(e.aprov);
    const d = await exportarDadosDaPessoa(e.admin, e.aprov) as any;
    expect(d.pessoa.id).toBe(e.aprov); expect(JSON.stringify(d)).not.toContain(codigo); // o código nunca sai na exportação
    await expect(exportarDadosDaPessoa(e.integ, e.aprov)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(anonimizarPessoa(e.admin, e.admin)).rejects.toThrow(/própria conta/);
    await expect(anonimizarPessoa(e.coord, e.aprov)).rejects.toBeInstanceOf(ForbiddenError);
    await anonimizarPessoa(e.admin, e.aprov);
    const u = (await query<any>("SELECT nome, email, status, acesso_hmac, acesso_enc FROM users WHERE id = ?", [e.aprov]))[0];
    expect(u.nome).toMatch(/Membro removido/); expect(u.status).toBe("suspenso"); expect(u.acesso_hmac).toBeNull(); expect(u.acesso_enc).toBeNull();
    expect((await query<any>("SELECT COUNT(*) n FROM dispositivos_conhecidos WHERE user_id = ?", [e.aprov]))[0].n).toBe(0);
    expect(await autenticarCodigo(codigo, "10.4.4.4", semEspera)).toMatchObject({ ok: false });
    await expect(anonimizarPessoa(e.coord, e.admin)).rejects.toBeInstanceOf(ForbiddenError);
  });
});
