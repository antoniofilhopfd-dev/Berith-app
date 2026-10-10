import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { closePool, execute, query } from "@/lib/db";
import { ForbiddenError } from "@/lib/permissions";
import {
  aprovar, conciliar, contasECategorias, criarCategoria, criarLancamento, editarLancamento, estornar, exportarCsv, fecharPeriodo, getLancamento,
  listarLancamentos, minhasContribuicoes, painel, prestacaoPublica, publicarPrestacao, reabrirPeriodo, rejeitar, relatorioMensal, saldoAte,
} from "@/lib/services/financeiro";
import { DomainError, NotFoundError } from "@/lib/services/errors";
import { lancamentoSchema } from "@/lib/validation/financeiro";
import { formatBRL, parseBRL } from "@/lib/dinheiro";
import { addDays, todayLocal } from "@/lib/time";
import { resetTestDb, criarUsuario, criarUnidade, darPapel, vincular } from "./helpers";

let admin = 0, fin1 = 0, fin2 = 0, coord = 0, membro = 0, doadora = 0, conta = 0, catEnt = 0, catSai = 0;
const hoje = todayLocal();
const lan = (o: Record<string, unknown> = {}) => lancamentoSchema.parse({ contaId: String(conta), categoriaId: String(catEnt), tipo: "entrada", valor: "100,00", data: hoje, descricao: "Contribuição mensal", ...o });
const mesPassado = () => { const d = new Date(`${hoje}T12:00:00Z`); d.setUTCMonth(d.getUTCMonth() - 1, 15); return d.toISOString().slice(0, 10); };

beforeAll(async () => {
  await resetTestDb();
  admin = await criarUsuario("adm@t.com", "Admin"); fin1 = await criarUsuario("f1@t.com", "Financeiro 1"); fin2 = await criarUsuario("f2@t.com", "Financeiro 2");
  coord = await criarUsuario("co@t.com"); membro = await criarUsuario("m@t.com"); doadora = await criarUsuario("d@t.com", "Doadora Generosa");
  await darPapel(admin, "admin_geral"); await darPapel(fin1, "resp_financeiro"); await darPapel(fin2, "resp_financeiro");
  const u = await criarUnidade("ministerio", "Música"); await darPapel(coord, "coord_ministerio", u); await vincular(membro, u);
  const { contas, categorias } = await contasECategorias();
  conta = contas[0].id; catEnt = categorias.find((c) => c.tipo === "entrada")!.id; catSai = categorias.find((c) => c.tipo === "saida")!.id;
});
afterAll(closePool);

describe("dinheiro em centavos", () => {
  it("interpreta valores no formato brasileiro sem ponto flutuante", () => {
    expect(parseBRL("1.234,56")).toBe(123456); expect(parseBRL("1234,5")).toBe(123450); expect(parseBRL("1234")).toBe(123400);
    expect(parseBRL("R$ 10,00")).toBe(1000); expect(parseBRL("0,01")).toBe(1); expect(parseBRL("0,10")).toBe(10);
  });
  it("recusa zero, negativo, ambíguo e lixo", () => {
    for (const v of ["0", "0,00", "-5", "1.5", "1,234", "12.34", "abc", "", "1e3", "1,2,3", "99999999999999"]) expect(parseBRL(v), v).toBeNull();
  });
  it("formata com milhar e vírgula (inclusive negativos)", () => {
    expect(formatBRL(123456)).toBe("R$ 1.234,56"); expect(formatBRL(5)).toBe("R$ 0,05"); expect(formatBRL(-2500)).toBe("-R$ 25,00"); expect(formatBRL(100000000)).toBe("R$ 1.000.000,00");
  });
  it("somas decimais clássicas não perdem centavos (0,10 + 0,20 = 0,30)", () => {
    expect((parseBRL("0,10")! + parseBRL("0,20")!)).toBe(parseBRL("0,30"));
  });
});

describe("acesso independente dos vínculos organizacionais", () => {
  it("coordenação e integrantes não veem nada do financeiro", async () => {
    for (const u of [coord, membro]) {
      await expect(painel(u)).rejects.toThrow(ForbiddenError);
      await expect(listarLancamentos(u)).rejects.toThrow(ForbiddenError);
      await expect(criarLancamento(u, lan())).rejects.toThrow(ForbiddenError);
      await expect(relatorioMensal(u, hoje.slice(0, 7))).rejects.toThrow(ForbiddenError);
      await expect(exportarCsv(u, hoje.slice(0, 7))).rejects.toThrow(ForbiddenError);
    }
  });
  it("responsável financeiro não ganha acesso às estruturas", async () => {
    const { can } = await import("@/lib/permissions");
    expect(await can(fin1, "eventos", "ver", 1)).toBe(false);
    expect(await can(fin1, "membros", "ver", null)).toBe(false);
  });
});

describe("lançamentos, aprovação e imutabilidade", () => {
  let id = 0;
  it("cria pendente; não conta no saldo até ser aprovado", async () => {
    id = await criarLancamento(fin1, lan({ valor: "250,75" }));
    expect((await getLancamento(fin1, id)).status).toBe("pendente");
    expect(await saldoAte(hoje)).toBe(0);
  });
  it("quem lançou não aprova (aprovação dupla); outra pessoa aprova", async () => {
    await expect(aprovar(fin1, id)).rejects.toThrow(/Outra pessoa/);
    await aprovar(fin2, id);
    expect(await saldoAte(hoje)).toBe(25075);
    await expect(aprovar(admin, id)).rejects.toThrow(DomainError); // já decidido
  });
  it("aprovação dupla pode ser desligada pela configuração da comunidade", async () => {
    await execute("UPDATE settings SET valor = '0' WHERE chave = 'financeiro_aprovacao_dupla'");
    const x = await criarLancamento(fin1, lan({ valor: "1,00" }));
    await aprovar(fin1, x);
    await execute("UPDATE settings SET valor = '1' WHERE chave = 'financeiro_aprovacao_dupla'");
    const e = await estornar(fin2, x, "Teste"); expect(e).toBeGreaterThan(0);
  });
  it("lançamento aprovado é imutável: não edita; correção só por estorno", async () => {
    await expect(editarLancamento(fin1, id, lan({ valor: "999,00" }))).rejects.toThrow(/estorno/);
    expect((await getLancamento(fin1, id)).valor_centavos).toBe(25075);
  });
  it("rejeitar exige motivo e deixa editar; ao editar volta a pendente", async () => {
    const x = await criarLancamento(fin1, lan({ descricao: "Errado" }));
    await rejeitar(fin2, x, "Valor divergente do comprovante");
    expect(await getLancamento(fin1, x)).toMatchObject({ status: "rejeitado", motivo: "Valor divergente do comprovante" });
    await editarLancamento(fin1, x, lan({ descricao: "Corrigido", valor: "10,00" }));
    expect(await getLancamento(fin1, x)).toMatchObject({ status: "pendente", descricao: "Corrigido", valor_centavos: 1000 });
    expect(await saldoAte(hoje)).toBe(25075); // pendente/rejeitado não entram no saldo
  });
  it("valida categoria x tipo, data futura, doador em saída", async () => {
    await expect(criarLancamento(fin1, lan({ categoriaId: String(catSai) }))).rejects.toThrow(/categoria/);
    await expect(criarLancamento(fin1, lan({ data: addDays(hoje, 2) }))).rejects.toThrow(/futura/);
    await expect(criarLancamento(fin1, lan({ tipo: "saida", categoriaId: String(catSai), doadorNome: "Fulano" }))).rejects.toThrow(/entradas/);
  });
  it("valor zero ou negativo é barrado já na validação e no banco", async () => {
    expect(() => lan({ valor: "0,00" })).toThrow(); expect(() => lan({ valor: "-1" })).toThrow();
    await expect(execute("INSERT INTO fin_lancamentos (conta_id, categoria_id, tipo, valor_centavos, data, descricao, criado_por) VALUES (?,?, 'entrada', 0, ?, 'x', ?)", [conta, catEnt, hoje, fin1])).rejects.toThrow();
  });
});

describe("estornos", () => {
  it("estorno cria lançamento reverso aprovado, zera o efeito e preserva o original", async () => {
    const antes = await saldoAte(hoje);
    const id = await criarLancamento(fin1, lan({ valor: "40,00", tipo: "entrada", descricao: "Entrada a estornar" }));
    await aprovar(fin2, id);
    expect(await saldoAte(hoje)).toBe(antes + 4000);
    const e = await estornar(fin2, id, "Lançado em duplicidade");
    expect(await saldoAte(hoje)).toBe(antes);
    const orig = await getLancamento(fin1, id), rev = await getLancamento(fin1, e);
    expect(orig).toMatchObject({ status: "aprovado", valor_centavos: 4000, estornado_por: e });
    expect(rev).toMatchObject({ tipo: "saida", valor_centavos: 4000, estorno_de: id, status: "aprovado", motivo: "Lançado em duplicidade" });
  });
  it("não estorna duas vezes, nem estorno, nem pendente; exige permissão e motivo", async () => {
    const id = await criarLancamento(fin1, lan({ valor: "5,00" }));
    await expect(estornar(fin2, id, "x")).rejects.toThrow(/aprovados/);
    await aprovar(fin2, id);
    await expect(estornar(coord, id, "teste")).rejects.toThrow(ForbiddenError);
    const e = await estornar(fin2, id, "Motivo válido");
    await expect(estornar(admin, id, "Segundo estorno")).rejects.toThrow(/já foi estornado/);
    await expect(estornar(admin, e, "Estornar o estorno")).rejects.toThrow(/Um estorno não/);
  });
  it("estornos simultâneos: apenas um prevalece", async () => {
    const id = await criarLancamento(fin1, lan({ valor: "7,00" }));
    await aprovar(fin2, id);
    const r = await Promise.allSettled([estornar(fin2, id, "A"), estornar(admin, id, "B"), estornar(fin2, id, "C")]);
    expect(r.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    expect((await query<any>("SELECT COUNT(*) n FROM fin_lancamentos WHERE estorno_de = ?", [id]))[0].n).toBe(1);
  });
});

describe("contribuições individuais exigem autorização específica", () => {
  let id = 0;
  beforeAll(async () => {
    // fin2 perde a autorização específica (mantém o financeiro geral)
    await execute("DELETE ur FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = ? AND r.codigo = 'resp_financeiro'", [fin2]);
    await darPapel(fin2, "resp_comunicacao");
    await execute("INSERT IGNORE INTO role_permissions (role_id, recurso, acao) SELECT id, 'financeiro', 'ver' FROM roles WHERE codigo = 'resp_comunicacao'");
    id = await criarLancamento(fin1, lan({ doadorEmail: "d@t.com", valor: "300,00", descricao: "Dízimo" }));
    await aprovar(admin, id);
  });
  it("quem tem financeiro mas não 'contribuições' não recebe o doador (objeto, listagem nem CSV)", async () => {
    expect((await getLancamento(fin2, id)).doador_user_id).toBeNull();
    expect((await listarLancamentos(fin2, {})).itens.find((l) => l.id === id)!.doador_user_id).toBeNull();
    expect((await getLancamento(fin1, id)).doador_user_id).toBe(doadora);
    await execute("INSERT IGNORE INTO role_permissions (role_id, recurso, acao) SELECT id, 'financeiro', 'exportar' FROM roles WHERE codigo = 'resp_comunicacao'");
    expect(await exportarCsv(fin2, hoje.slice(0, 7))).not.toContain("Doadora Generosa");
    expect(await exportarCsv(fin1, hoje.slice(0, 7))).toContain("Doadora Generosa");
  });
  it("cada pessoa vê as próprias contribuições; outras não veem as dos demais", async () => {
    expect((await minhasContribuicoes(doadora)).map((c) => c.valor_centavos)).toEqual([30000]);
    expect(await minhasContribuicoes(membro)).toEqual([]);
    const e = await estornar(admin, id, "Devolução");
    expect(e).toBeGreaterThan(0);
    expect(await minhasContribuicoes(doadora)).toEqual([]); // estornada não aparece
  });
});

describe("períodos, relatório, prestação de contas e conciliação", () => {
  const passado = mesPassado(); const pper = passado.slice(0, 7);
  let idp = 0;
  beforeAll(async () => {
    // lançamento no mês passado inserido direto (a regra de data futura/período atual não se aplica a dados históricos)
    const r = await execute("INSERT INTO fin_lancamentos (conta_id, categoria_id, tipo, valor_centavos, data, descricao, status, criado_por, aprovado_por, aprovado_em) VALUES (?,?, 'entrada', 150000, ?, 'Arrecadação do mês passado', 'aprovado', ?, ?, UTC_TIMESTAMP())", [conta, catEnt, passado, fin1, fin2]);
    idp = r.insertId;
    await execute("INSERT INTO fin_lancamentos (conta_id, categoria_id, tipo, valor_centavos, data, descricao, status, criado_por, aprovado_por, aprovado_em) VALUES (?,?, 'saida', 40050, ?, 'Despesa do mês passado', 'aprovado', ?, ?, UTC_TIMESTAMP())", [conta, catSai, passado, fin1, fin2]);
  });
  it("relatório mensal soma por categoria em centavos", async () => {
    const r = await relatorioMensal(fin1, pper);
    expect([r.entradas, r.saidas, r.saldoFinal - r.saldoAnterior]).toEqual([150000, 40050, 109950]);
    expect(r.categorias.map((c) => c.nome).sort()).toEqual(["Ajuda social", "Arrecadação de evento"]);
  });
  it("não fecha o mês corrente nem com pendências; fecha com saldo registrado", async () => {
    await expect(fecharPeriodo(fin1, hoje.slice(0, 7))).rejects.toThrow(/encerrados/);
    const p = await execute("INSERT INTO fin_lancamentos (conta_id, categoria_id, tipo, valor_centavos, data, descricao, criado_por) VALUES (?,?, 'saida', 100, ?, 'pendente antigo', ?)", [conta, catSai, passado, fin1]);
    await expect(fecharPeriodo(fin1, pper)).rejects.toThrow(/pendente/);
    await execute("DELETE FROM fin_lancamentos WHERE id = ?", [p.insertId]);
    await expect(fecharPeriodo(coord, pper)).rejects.toThrow(ForbiddenError);
    await fecharPeriodo(fin1, pper);
    expect((await query<any>("SELECT saldo_final_centavos s FROM fin_periodos WHERE periodo = ?", [pper]))[0].s).toBe(await saldoAte(`${pper}-31`));
    await expect(fecharPeriodo(fin1, pper)).rejects.toThrow(/já fechado/);
  });
  it("período fechado bloqueia lançar, editar e aprovar nele", async () => {
    await expect(criarLancamento(fin1, lan({ data: passado }))).rejects.toThrow(/fechado/);
    const x = await execute("INSERT INTO fin_lancamentos (conta_id, categoria_id, tipo, valor_centavos, data, descricao, criado_por) VALUES (?,?, 'saida', 100, ?, 'tardio', ?)", [conta, catSai, passado, fin1]);
    await expect(aprovar(admin, x.insertId)).rejects.toThrow(/fechado/);
    await expect(editarLancamento(fin1, x.insertId, lan({ data: passado }))).rejects.toThrow(/fechado/);
  });
  it("prestação de contas: só publicada, só totais por categoria, visível sem permissão financeira", async () => {
    expect(await prestacaoPublica()).toEqual([]);
    await expect(publicarPrestacao(coord, pper, true)).rejects.toThrow(ForbiddenError);
    await publicarPrestacao(fin1, pper, true);
    const p = await prestacaoPublica();
    expect(p).toHaveLength(1);
    expect(p[0]).toMatchObject({ periodo: pper, entradas: 150000, saidas: 40050 });
    expect(JSON.stringify(p)).not.toMatch(/Doadora|doador|descricao|Arrecadação do mês/);
  });
  it("reabrir exige administração e motivo, é auditado e libera novos lançamentos", async () => {
    await expect(reabrirPeriodo(fin1, pper, "x")).rejects.toThrow(ForbiddenError); // fin1 não tem 'permissoes'
    await reabrirPeriodo(admin, pper, "Correção de lançamento esquecido");
    expect((await query<any>("SELECT acao FROM audit_log WHERE acao = 'financeiro.reabrir_periodo'")).length).toBe(1);
    expect(await criarLancamento(fin1, lan({ data: passado, descricao: "Após reabrir" }))).toBeGreaterThan(0);
  });
  it("conciliação registra a diferença entre extrato e sistema sem alterar valores", async () => {
    const c = await conciliar(fin1, conta, pper, 109950, [idp]);
    expect(c.sistema).toBe(150000); expect(c.diferenca).toBe(109950 - 150000);
    await expect(conciliar(coord, conta, pper, 1, [])).rejects.toThrow(ForbiddenError);
    expect((await getLancamento(fin1, idp)).valor_centavos).toBe(150000);
  });
});

describe("exportação, categorias e auditoria", () => {
  it("CSV neutraliza fórmulas e registra auditoria da exportação", async () => {
    const x = await criarLancamento(fin1, lan({ descricao: "=HYPERLINK(\"http://x\")", valor: "1,00" }));
    const csv = await exportarCsv(fin1, hoje.slice(0, 7));
    expect(csv.startsWith("﻿")).toBe(true); expect(csv).toContain(`"'=HYPERLINK`); expect(x).toBeGreaterThan(0);
    expect((await query<any>("SELECT COUNT(*) n FROM audit_log WHERE acao = 'financeiro.exportar'"))[0].n).toBeGreaterThan(0);
  });
  it("criar categoria exige permissão e recusa duplicidade", async () => {
    await expect(criarCategoria(coord, "Nova", "saida")).rejects.toThrow(ForbiddenError);
    await criarCategoria(fin1, "Nova categoria", "saida");
    await expect(criarCategoria(fin1, "Nova categoria", "saida")).rejects.toThrow(/já existe/);
  });
  it("toda operação financeira fica auditada, sem guardar dados pessoais desnecessários", async () => {
    const a = await query<any>("SELECT acao, detalhes FROM audit_log WHERE acao LIKE 'financeiro.%'");
    const acoes = new Set(a.map((x: any) => x.acao));
    for (const k of ["financeiro.criar", "financeiro.aprovar", "financeiro.rejeitar", "financeiro.estornar", "financeiro.fechar_periodo", "financeiro.conciliar", "financeiro.exportar"]) expect(acoes.has(k), k).toBe(true);
    expect(JSON.stringify(a)).not.toContain("Doadora Generosa");
  });
  it("inexistente vira 404 para quem pode ver", async () => {
    await expect(getLancamento(fin1, 999999)).rejects.toThrow(NotFoundError);
  });
});
