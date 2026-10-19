import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execute, query, closePool } from "@/lib/db";
import { limitar, _limparLimites } from "@/lib/auth/limite";
import { hashPassword } from "@/lib/auth/password";
import { authenticate } from "@/lib/auth/login";
import { trocarSenha } from "@/lib/services/senha";
import * as P from "@/lib/services/publicacoes";
import * as M from "@/lib/services/midia";
import * as PL from "@/lib/services/planejamento";
import { listarAuditoria } from "@/lib/services/auditoria";
import { ForbiddenError } from "@/lib/permissions";
import { DomainError } from "@/lib/services/errors";
import { criarMidia, equipePadrao, pubBase, resetTestDb } from "./helpers";

let e: Awaited<ReturnType<typeof equipePadrao>>;
const X = { prazo: null, publicarEm: null };
beforeAll(async () => { await resetTestDb(); e = await equipePadrao(); });
afterAll(closePool);

describe("limitador de taxa", () => {
  it("bloqueia depois do máximo na janela e libera depois dela", () => {
    _limparLimites();
    for (let i = 0; i < 3; i++) expect(limitar("k", 3, 1000, 1000 + i).ok).toBe(true);
    const r = limitar("k", 3, 1000, 1500); expect(r.ok).toBe(false); expect(r.esperarSeg).toBeGreaterThan(0);
    expect(limitar("k", 3, 1000, 2100).ok).toBe(true); // a primeira saiu da janela
    expect(limitar("outro", 3, 1000, 1500).ok).toBe(true); // chaves independentes
  });
});

describe("troca de senha", () => {
  it("exige a senha atual, bloqueia tentativas em excesso e encerra as sessões", async () => {
    const hash = await hashPassword("Senha-Atual-123");
    const r = await execute("INSERT INTO users (nome, email, senha_hash, status) VALUES ('Troca','troca@t.com',?, 'ativo')", [hash]);
    const u = r.insertId;
    await execute("INSERT INTO sessions (user_id, token_hash, expira_em) VALUES (?, 's1', DATE_ADD(UTC_TIMESTAMP(), INTERVAL 1 DAY))", [u]);
    await expect(trocarSenha(u, "errada", "Nova-Senha-123")).rejects.toThrow(/incorreta/);
    await expect(trocarSenha(u, "Senha-Atual-123", "Senha-Atual-123")).rejects.toThrow(/diferente/);
    await trocarSenha(u, "Senha-Atual-123", "Nova-Senha-456");
    expect((await authenticate("troca@t.com", "Nova-Senha-456", "5.5.5.5")).ok).toBe(true);
    expect((await authenticate("troca@t.com", "Senha-Atual-123", "5.5.5.6")).ok).toBe(false);
    expect((await query<any>("SELECT COUNT(*) n FROM sessions WHERE user_id = ? AND revogada_em IS NULL", [u]))[0].n).toBe(0);
    for (let i = 0; i < 5; i++) await trocarSenha(u, "errada", "Qualquer-123").catch(() => undefined);
    await expect(trocarSenha(u, "Nova-Senha-456", "Outra-Senha-789")).rejects.toThrow(/Muitas tentativas/); // mesmo com a senha certa
  });
});

describe("entradas maliciosas", () => {
  it("curingas e aspas em buscas não vazam nem quebram (SQL parametrizado)", async () => {
    const m = await criarMidia(e.integ);
    await P.criar(e.integ, pubBase({ titulo: "Título normal", midiaIds: [m] }), X);
    for (const q of ["%", "_", "' OR '1'='1", "\\", "'; DROP TABLE publicacoes; --", "%' UNION SELECT senha_hash FROM users -- "]) {
      expect(await P.listar(e.coord, { q })).toEqual([]);
      expect((await M.listar(e.coord, { q })).total).toBe(0);
      expect((await listarAuditoria(e.admin, { acao: q })).itens).toEqual([]);
    }
    expect((await P.listar(e.coord, {})).length).toBe(1); // a tabela continua lá
    expect(await P.listar(e.coord, { q: "normal" })).toHaveLength(1);
  });
  it("HTML/script em títulos e legendas é guardado como texto (a interface escapa)", async () => {
    const m = await criarMidia(e.integ);
    const id = await P.criar(e.integ, pubBase({ titulo: "<img src=x onerror=alert(1)>", legenda: "<script>alert(1)</script>", midiaIds: [m] }), X);
    const d = await P.getPub(e.integ, id);
    expect(d.pub.titulo).toBe("<img src=x onerror=alert(1)>"); expect(d.pub.legenda).toBe("<script>alert(1)</script>");
  });
  it("identificadores inválidos nunca viram consulta", async () => {
    await expect(P.getPub(e.coord, Number("1; DROP TABLE users"))).rejects.toBeDefined();
    await expect(M.getMidia(e.coord, -1)).rejects.toBeDefined();
  });
});

describe("isolamento entre perfis (IDOR)", () => {
  it("integrante não edita, cancela, exclui nem decide sobre conteúdo alheio", async () => {
    const m = await criarMidia(e.integ);
    const id = await P.criar(e.integ, pubBase({ midiaIds: [m] }), X);
    await expect(P.atualizar(e.integ2, id, pubBase({ titulo: "Invadido", midiaIds: [m] }), X)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(P.cancelar(e.integ2, id, null)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(P.excluir(e.integ2, id)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(P.decidir(e.integ2, id, "aprovado", null)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(P.enviarParaRevisao(e.integ2, id)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(P.salvarVersaoManual(e.integ2, id, "x")).rejects.toBeInstanceOf(ForbiddenError);
    await expect(P.duplicar(e.aprov, id)).rejects.toBeInstanceOf(ForbiddenError);
    expect((await P.getPub(e.integ, id)).pub.titulo).toBe("Post de teste");
  });
  it("quem não tem perfil não lê nada (publicações, mídias, planejamento, auditoria)", async () => {
    await expect(P.listar(e.semPerfil)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(M.listar(e.semPerfil)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(PL.listarCampanhas(e.semPerfil)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(listarAuditoria(e.integ)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(listarAuditoria(e.coord)).rejects.toBeInstanceOf(ForbiddenError);
  });
  it("conteúdo publicado é imutável, mesmo para o administrador", async () => {
    const m = await criarMidia(e.integ);
    const id = await P.criar(e.integ, pubBase({ midiaIds: [m] }), X);
    await execute("UPDATE publicacoes SET status = 'publicado' WHERE id = ?", [id]);
    await expect(P.atualizar(e.admin, id, pubBase({ titulo: "Reescrita", midiaIds: [m] }), X)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(P.cancelar(e.admin, id, null)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(P.excluir(e.admin, id)).rejects.toBeInstanceOf(DomainError);
  });
  it("ações sensíveis ficam na auditoria", async () => {
    const acoes = (await listarAuditoria(e.admin, {})).itens.map((x) => x.acao);
    expect(acoes).toEqual(expect.arrayContaining(["publicacao.criar"]));
    expect(JSON.stringify(await listarAuditoria(e.admin, {}))).not.toMatch(/senha_hash|\$2[aby]\$|access_token/);
  });
});
