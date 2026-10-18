import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execute, query, closePool } from "@/lib/db";
import { ForbiddenError } from "@/lib/permissions";
import { DomainError, NotFoundError } from "@/lib/services/errors";
import * as P from "@/lib/services/publicacoes";
import { setSetting } from "@/lib/services/configuracoes";
import { criarMidia, criarUsuario, equipePadrao, pubBase, resetTestDb } from "./helpers";

let e: Awaited<ReturnType<typeof equipePadrao>>;
let img: number, img2: number, vid: number;
const X = { prazo: null, publicarEm: null };
beforeAll(async () => { await resetTestDb(); e = await equipePadrao(); img = await criarMidia(e.admin); img2 = await criarMidia(e.admin); vid = await criarMidia(e.admin, "video"); });
afterAll(closePool);

const nova = (o = {}) => P.criar(e.integ, pubBase({ midiaIds: [img], ...o }), X);
const status = async (id: number) => (await query<any>("SELECT status FROM publicacoes WHERE id = ?", [id]))[0].status;

describe("criação e leitura", () => {
  it("cria rascunho com versão inicial, histórico e redes", async () => {
    const id = await P.criar(e.integ, pubBase({ midiaIds: [img], redes: ["instagram", "facebook"], hashtags: "#fé" }), X);
    const d = await P.getPub(e.integ, id);
    expect(d.pub.status).toBe("rascunho"); expect(d.pub.versao).toBe(1); expect(d.pub.responsavel_id).toBe(e.integ);
    expect(d.redes.map((r) => r.rede)).toEqual(["instagram", "facebook"]); expect(d.midias.map((m) => m.id)).toEqual([img]);
    expect((await P.historico(e.integ, id))[0].acao).toBe("criar");
    expect((await P.versoes(e.integ, id)).map((v) => v.versao)).toEqual([1]);
  });
  it("quem não tem perfil não vê nem cria", async () => {
    await expect(P.criar(e.semPerfil, pubBase(), X)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(P.listar(e.semPerfil)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(P.criar(e.aprov, pubBase(), X)).rejects.toBeInstanceOf(ForbiddenError); // aprovador não produz
  });
  it("recusa referências inexistentes (campanha, responsável, mídia)", async () => {
    await expect(P.criar(e.integ, pubBase({ campanhaId: 9999 }), X)).rejects.toBeInstanceOf(DomainError);
    await expect(P.criar(e.integ, pubBase({ responsavelId: 9999 }), X)).rejects.toBeInstanceOf(DomainError);
    await expect(P.criar(e.integ, pubBase({ midiaIds: [9999] }), X)).rejects.toBeInstanceOf(DomainError);
  });
  it("filtra por status, rede, responsável e texto", async () => {
    const a = await nova({ titulo: "Quaresma dia 1", redes: ["facebook"] });
    const todas = await P.listar(e.coord, {});
    expect(todas.some((p) => p.id === a)).toBe(true);
    expect((await P.listar(e.coord, { rede: "facebook" })).every((p) => p.redes.includes("facebook"))).toBe(true);
    expect((await P.listar(e.coord, { q: "Quaresma" })).map((p) => p.id)).toContain(a);
    expect((await P.listar(e.coord, { minhas: e.integ2 })).map((p) => p.id)).not.toContain(a);
  });
});

describe("edição e permissões de edição", () => {
  it("integrante edita o que criou/é responsável, não o dos outros; coordenador edita tudo", async () => {
    const id = await nova();
    await P.atualizar(e.integ, id, pubBase({ titulo: "Novo título", midiaIds: [img] }), X);
    await expect(P.atualizar(e.integ2, id, pubBase(), X)).rejects.toBeInstanceOf(ForbiddenError);
    await P.atualizar(e.coord, id, pubBase({ titulo: "Título do coordenador", midiaIds: [img] }), X);
    expect((await P.getPub(e.integ, id)).pub.titulo).toBe("Título do coordenador");
    expect((await P.getPub(e.integ2, id)).podeEditar).toBe(false); // vê, mas não edita
  });
  it("controle de concorrência: edição com revisão antiga é recusada", async () => {
    const id = await nova();
    const r1 = await P.atualizar(e.integ, id, pubBase({ titulo: "A", midiaIds: [img] }), X, { baseRev: 0 });
    await expect(P.atualizar(e.integ, id, pubBase({ titulo: "B", midiaIds: [img] }), X, { baseRev: 0 })).rejects.toThrow(/Outra pessoa alterou/);
    const r2 = await P.atualizar(e.integ, id, pubBase({ titulo: "C", midiaIds: [img] }), X, { baseRev: r1.rev, autosave: true });
    expect(r2.rev).toBe(r1.rev + 1);
  });
  it("salvamento automático não gera histórico nem versão", async () => {
    const id = await nova();
    const antes = (await P.historico(e.integ, id)).length;
    await P.atualizar(e.integ, id, pubBase({ legenda: "rascunho em andamento", midiaIds: [img] }), X, { autosave: true });
    expect((await P.historico(e.integ, id)).length).toBe(antes); expect((await P.versoes(e.integ, id)).length).toBe(1);
  });
  it("não remove uma rede já publicada", async () => {
    const id = await nova({ redes: ["instagram", "facebook"] });
    await execute("UPDATE publicacao_redes SET envio = 'publicada' WHERE publicacao_id = ? AND rede = 'facebook'", [id]);
    await expect(P.atualizar(e.integ, id, pubBase({ redes: ["instagram"], midiaIds: [img] }), X)).rejects.toThrow(/já publicada/);
  });
});

describe("fluxo de aprovação", () => {
  it("rascunho → revisão → ajustes → revisão → aprovado, com versões e histórico", async () => {
    const id = await nova({ titulo: "Convite para o retiro" });
    await P.enviarParaRevisao(e.integ, id);
    expect(await status(id)).toBe("em_revisao");
    expect((await P.versoes(e.integ, id)).map((v) => v.versao)).toEqual([1]); // idêntica à inicial → reaproveita
    await expect(P.decidir(e.integ, id, "aprovado", null)).rejects.toBeInstanceOf(ForbiddenError); // integrante não aprova
    await expect(P.decidir(e.aprov, id, "ajustes", "  ")).rejects.toThrow(/Explique/);
    await P.decidir(e.aprov, id, "ajustes", "Trocar a imagem e corrigir a data");
    expect(await status(id)).toBe("ajustes_solicitados");
    const com = await P.comentarios(e.integ, id);
    expect(com.some((c) => c.tipo === "ajuste" && c.texto.includes("Trocar a imagem"))).toBe(true);
    await P.atualizar(e.integ, id, pubBase({ titulo: "Convite para o retiro", legenda: "Data corrigida: 20/11", midiaIds: [img2] }), X);
    await P.enviarParaRevisao(e.integ, id);
    expect((await P.versoes(e.integ, id)).map((v) => v.versao)).toEqual([2, 1]);
    await P.decidir(e.aprov, id, "aprovado", "Perfeito.");
    expect(await status(id)).toBe("aprovado");
    const h = await P.historicoAprovacao(e.integ, id);
    expect(h.map((x) => [x.decisao, x.versao, x.nome])).toEqual([["aprovado", 2, "Aprovador"], ["ajustes", 1, "Aprovador"]]);
    const acoes = (await P.historico(e.integ, id)).map((x) => x.acao);
    expect(acoes).toEqual(expect.arrayContaining(["criar", "status", "solicitar_ajustes", "aprovar"]));
  });
  it("não envia para revisão conteúdo incompleto e explica o motivo", async () => {
    const id = await P.criar(e.integ, pubBase({ midiaIds: [], redes: ["instagram"] }), X);
    await expect(P.enviarParaRevisao(e.integ, id)).rejects.toThrow(/imagem/);
    const sem = await P.criar(e.integ, pubBase({ redes: [], midiaIds: [img] }), X);
    await expect(P.enviarParaRevisao(e.integ, sem)).rejects.toThrow(/rede social/);
  });
  it("só decide quem está em revisão; transições inválidas são recusadas", async () => {
    const id = await nova();
    await expect(P.decidir(e.aprov, id, "aprovado", null)).rejects.toThrow(/não está aguardando/);
    await expect(P.enviarParaRevisao(e.integ2, id)).rejects.toBeInstanceOf(ForbiddenError);
    await P.enviarParaRevisao(e.integ, id);
    await expect(P.enviarParaRevisao(e.integ, id)).rejects.toBeInstanceOf(DomainError); // já em revisão
  });
  it("editar o conteúdo depois de aprovado invalida a aprovação", async () => {
    const id = await nova();
    await P.enviarParaRevisao(e.integ, id); await P.decidir(e.coord, id, "aprovado", null);
    expect(await status(id)).toBe("aprovado");
    const r = await P.atualizar(e.integ, id, pubBase({ legenda: "Legenda alterada depois", midiaIds: [img] }), X);
    expect(r.invalidou).toBe(true); expect(await status(id)).toBe("em_producao");
    expect((await P.historico(e.integ, id))[0].acao).toBe("conteudo_alterado");
  });
  it("mudar só prazo, responsável ou observações NÃO invalida a aprovação", async () => {
    const id = await nova();
    await P.enviarParaRevisao(e.integ, id); await P.decidir(e.coord, id, "aprovado", null);
    const r = await P.atualizar(e.coord, id, pubBase({ observacoes: "nota interna", responsavelId: e.integ2, midiaIds: [img] }), { prazo: new Date(Date.now() + 86400000), publicarEm: null });
    expect(r.invalidou).toBe(false); expect(await status(id)).toBe("aprovado");
  });
  it("a configuração pode impedir a autoaprovação", async () => {
    await setSetting("impedir_autoaprovacao", "1");
    const id = await P.criar(e.coord, pubBase({ midiaIds: [img] }), X);
    await P.enviarParaRevisao(e.coord, id);
    await expect(P.decidir(e.coord, id, "aprovado", null)).rejects.toThrow(/próprio conteúdo/);
    await P.decidir(e.aprov, id, "aprovado", null); expect(await status(id)).toBe("aprovado");
    await setSetting("impedir_autoaprovacao", "0");
  });
});

describe("versões e comparação", () => {
  it("compara versões e a versão atual com a última salva", async () => {
    const id = await nova({ legenda: "Venha rezar conosco hoje" });
    await P.atualizar(e.integ, id, pubBase({ legenda: "Venha rezar conosco amanhã", midiaIds: [img] }), X);
    await P.salvarVersaoManual(e.integ, id, "Ajuste de data");
    expect((await P.versoes(e.integ, id)).map((v) => [v.versao, v.motivo])).toEqual([[2, "Ajuste de data"], [1, "Versão inicial"]]);
    const c = await P.compararVersoes(e.integ, id, 1, 2);
    const leg = c.find((x) => x.campo === "legenda")!;
    expect(leg.mudou).toBe(true); expect(leg.trechos.some((t) => t.tipo === "adicionado" && t.texto.includes("amanhã"))).toBe(true);
    expect(c.find((x) => x.campo === "titulo")!.mudou).toBe(false);
    await P.atualizar(e.integ, id, pubBase({ legenda: "Em edição agora", midiaIds: [img] }), X);
    expect((await P.compararVersoes(e.integ, id, 2, null)).find((x) => x.campo === "legenda")!.mudou).toBe(true);
    await expect(P.compararVersoes(e.integ, id, 99, null)).rejects.toBeInstanceOf(NotFoundError);
  });
  it("sem mudanças não cria versão repetida", async () => {
    const id = await nova();
    const n1 = await P.salvarVersaoManual(e.integ, id, "igual"); expect(n1).toBe(1);
  });
});

describe("comentários, cancelamento, duplicação e modelos", () => {
  it("comenta, notifica os envolvidos e resolve ajustes", async () => {
    const id = await nova();
    await P.comentar(e.coord, id, "Ótima ideia!");
    const n = await query<any>("SELECT user_id, tipo FROM notificacoes WHERE dedupe_key LIKE 'com:%' ORDER BY id DESC LIMIT 5");
    expect(n.some((x: any) => x.user_id === e.integ && x.tipo === "comentario")).toBe(true);
    await expect(P.comentar(e.integ, id, "Ajuste", "ajuste")).rejects.toBeInstanceOf(ForbiddenError); // só aprovador pede ajuste
    await expect(P.comentar(e.semPerfil, id, "oi")).rejects.toBeInstanceOf(ForbiddenError);
    const cid = (await P.comentarios(e.integ, id))[0].id;
    await P.resolverComentario(e.integ, cid);
    expect((await P.comentarios(e.integ, id))[0].resolvido_em).not.toBeNull();
  });
  it("cancela, reabre e só exclui rascunho/cancelado (com permissão)", async () => {
    const id = await nova();
    await P.cancelar(e.integ, id, "mudou o planejamento"); expect(await status(id)).toBe("cancelado");
    await expect(P.atualizar(e.integ, id, pubBase({ midiaIds: [img] }), X)).rejects.toThrow(/cancelada/);
    await P.reabrir(e.integ, id); expect(await status(id)).toBe("rascunho");
    await expect(P.excluir(e.integ, id)).rejects.toBeInstanceOf(ForbiddenError);
    await P.enviarParaRevisao(e.integ, id);
    await expect(P.excluir(e.admin, id)).rejects.toThrow(/Só é possível excluir/);
    await P.cancelar(e.coord, id, null); await P.excluir(e.admin, id);
    await expect(P.getPub(e.admin, id)).rejects.toBeInstanceOf(NotFoundError);
  });
  it("duplica sem agendamento e sem aprovação", async () => {
    const id = await nova({ redes: ["instagram", "facebook"], legenda: "Original" });
    await P.enviarParaRevisao(e.integ, id); await P.decidir(e.coord, id, "aprovado", null);
    const c = await P.duplicar(e.integ2, id);
    const d = await P.getPub(e.integ2, c);
    expect(d.pub.status).toBe("rascunho"); expect(d.pub.titulo).toMatch(/\(cópia\)/); expect(d.pub.duplicada_de).toBe(id); expect(d.pub.responsavel_id).toBe(e.integ2);
    expect(d.redes.map((r) => r.rede)).toEqual(["instagram", "facebook"]); expect(d.midias).toHaveLength(1); expect(d.pub.publicar_em).toBeNull();
  });
  it("cria modelo a partir de uma publicação e novo conteúdo a partir do modelo", async () => {
    const id = await nova({ formato: "post", legenda: "Hoje é dia de {tema}", hashtags: "#NovaBerith", redes: ["instagram", "facebook"] });
    const m = await P.modeloDaPublicacao(e.integ, id, "Aviso padrão");
    expect((await P.listarModelos(e.integ)).find((x) => x.id === m)?.redes).toBe("instagram,facebook");
    const novo = await P.criarDeModelo(e.integ2, m, "Aviso de sábado");
    const d = await P.getPub(e.integ2, novo);
    expect(d.pub.legenda).toBe("Hoje é dia de {tema}"); expect(d.redes.map((r) => r.rede)).toEqual(["instagram", "facebook"]);
    await expect(P.excluirModelo(e.integ, m)).rejects.toBeInstanceOf(ForbiddenError);
    await P.excluirModelo(e.coord, m);
  });
  it("designar outro responsável notifica essa pessoa", async () => {
    const outro = await criarUsuario("resp@t.com", "Resp"); await execute("INSERT INTO user_roles (user_id, role_id, scope_unit_id, scope_unit_id_key) SELECT ?, id, NULL, 0 FROM roles WHERE codigo='integrante'", [outro]);
    const id = await P.criar(e.coord, pubBase({ responsavelId: outro, midiaIds: [img] }), X);
    expect((await query<any>("SELECT COUNT(*) n FROM notificacoes WHERE user_id = ? AND dedupe_key = ?", [outro, `resp:${id}:${outro}`]))[0].n).toBe(1);
  });
});

describe("notificações do fluxo", () => {
  it("avisa aprovadores ao enviar para revisão e o responsável na decisão", async () => {
    const id = await nova({ titulo: "Aviso de missa" });
    await P.enviarParaRevisao(e.integ, id);
    const ap = await query<any>("SELECT user_id FROM notificacoes WHERE tipo = 'aprovacao' AND titulo LIKE '%Aviso de missa%'");
    expect(ap.map((x: any) => x.user_id).sort()).toEqual([e.admin, e.coord, e.aprov].sort());
    await P.decidir(e.aprov, id, "ajustes", "Falta o horário");
    const r = await query<any>("SELECT corpo FROM notificacoes WHERE user_id = ? AND tipo = 'ajuste' ORDER BY id DESC LIMIT 1", [e.integ]);
    expect(r[0].corpo).toBe("Falta o horário");
  });
});
