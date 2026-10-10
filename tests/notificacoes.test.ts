import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { closePool, execute, query } from "@/lib/db";
import { aprovadoresFinanceiros, destinatarios, emSilencio, listar, marcarLida, marcarTodasLidas, naoLidas, notificar, preferencias, salvarPreferencias } from "@/lib/services/notificacoes";
import { cancelarInscricao, definirEnviador, dispositivos, gerarLembretes, inscrever, pushConfigurado, processarPush, segredoValido, validarInscricao, type Enviador } from "@/lib/services/push";
import { createComunicado } from "@/lib/services/comunicados";
import { cancelEvent, createEvent, rsvp } from "@/lib/services/eventos";
import { assign, createShift } from "@/lib/services/escalas";
import { createTask } from "@/lib/services/tarefas";
import { createMeeting } from "@/lib/services/reunioes";
import { criarLancamento, contasECategorias } from "@/lib/services/financeiro";
import { comunicadoSchema, eventoSchema } from "@/lib/validation/eventos";
import { escalaSchema, reuniaoSchema, tarefaSchema } from "@/lib/validation/organizacao";
import { lancamentoSchema } from "@/lib/validation/financeiro";
import { addDays, todayLocal } from "@/lib/time";
import { resetTestDb, criarUsuario, criarUnidade, darPapel, vincular } from "./helpers";

let admin = 0, coordA = 0, ana = 0, bia = 0, beto = 0, fin1 = 0, fin2 = 0, A = 0, B = 0, serv = 0;
const sub = (n: number) => ({ endpoint: `https://push.exemplo.org/send/${n}`, keys: { p256dh: "BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U", auth: "tBHItJI5svbpez7KI4CCXg" } });
const nots = async (u: number) => (await query<any>("SELECT titulo, tipo, agendada_para FROM notificacoes WHERE user_id = ? ORDER BY id", [u]));

beforeAll(async () => {
  await resetTestDb();
  admin = await criarUsuario("adm@t.com"); coordA = await criarUsuario("ca@t.com"); ana = await criarUsuario("ana@t.com", "Ana"); bia = await criarUsuario("bia@t.com", "Bia"); beto = await criarUsuario("beto@t.com", "Beto");
  fin1 = await criarUsuario("f1@t.com"); fin2 = await criarUsuario("f2@t.com");
  await darPapel(admin, "admin_geral"); await darPapel(fin1, "resp_financeiro"); await darPapel(fin2, "resp_financeiro");
  A = await criarUnidade("ministerio", "A"); B = await criarUnidade("ministerio", "B"); serv = await criarUnidade("servico", "Acolhida");
  await darPapel(coordA, "coord_ministerio", A); await darPapel(coordA, "resp_servico", serv);
  await vincular(ana, A); await vincular(bia, A); await vincular(beto, B); await vincular(ana, serv); await vincular(bia, serv);
});
afterEach(() => definirEnviador(null));
afterAll(closePool);

describe("notificações internas", () => {
  it("destinatários respeitam a estrutura (integrantes e responsáveis), nunca outras", async () => {
    expect((await destinatarios(A, [])).sort()).toEqual([coordA, ana, bia].sort());
    expect(await destinatarios(B, [])).toEqual([beto]);
    expect((await destinatarios(null)).length).toBe(7);
    expect((await destinatarios(A, [ana])).includes(ana)).toBe(false);
  });
  it("duplicidade é impossível (mesma chave) e preferência desligada é respeitada", async () => {
    expect(await notificar([ana, bia], { tipo: "sistema", titulo: "Teste", dedupeKey: "t1" })).toBe(2);
    expect(await notificar([ana, bia], { tipo: "sistema", titulo: "Teste", dedupeKey: "t1" })).toBe(0);
    await salvarPreferencias(bia, { pushAtivo: true, silencioInicio: null, silencioFim: null, tipos: { sistema: false } });
    expect(await notificar([ana, bia], { tipo: "sistema", titulo: "Outro", dedupeKey: "t2" })).toBe(1);
    expect((await nots(bia)).map((n) => n.titulo)).not.toContain("Outro");
  });
  it("cada pessoa lê e marca só as próprias", async () => {
    const [n] = await query<any>("SELECT id FROM notificacoes WHERE user_id = ? LIMIT 1", [ana]);
    await marcarLida(bia, n.id); // de outra pessoa: sem efeito
    expect(await naoLidas(ana)).toBeGreaterThan(0);
    await marcarLida(ana, n.id); await marcarTodasLidas(ana);
    expect(await naoLidas(ana)).toBe(0);
    expect((await listar(ana)).every((x) => x.lida_em)).toBe(true);
  });
  it("notificações agendadas no futuro não aparecem antes da hora", async () => {
    await notificar([ana], { tipo: "sistema", titulo: "Futura", dedupeKey: "fut", agendadaPara: new Date(Date.now() + 3600_000) });
    expect((await listar(ana)).map((n) => n.titulo)).not.toContain("Futura");
  });
});

describe("gatilhos nas ações do sistema (só para quem tem direito de saber)", () => {
  it("comunicado da estrutura A avisa A, não B; o autor não se notifica", async () => {
    await createComunicado(coordA, comunicadoSchema.parse({ titulo: "Aviso da A", corpo: "Texto do aviso", unitId: String(A) }));
    expect((await nots(ana)).map((n) => n.titulo)).toContain("Novo comunicado");
    expect(await nots(beto)).toEqual([]);
    expect(await nots(coordA)).toEqual([]);
  });
  it("comunicado agendado cria notificação para a data de publicação", async () => {
    await createComunicado(coordA, comunicadoSchema.parse({ titulo: "Agendado", corpo: "Texto agendado", unitId: String(A), publicarData: addDays(todayLocal(), 3) }));
    expect((await listar(bia)).map((n) => n.corpo)).not.toContain("Agendado");
    expect((await query<any>("SELECT agendada_para FROM notificacoes WHERE corpo = 'Agendado' LIMIT 1"))[0].agendada_para.getTime()).toBeGreaterThan(Date.now());
  });
  it("evento novo e cancelado avisam a estrutura", async () => {
    const id = await createEvent(coordA, eventoSchema.parse({ titulo: "Encontro A", data: addDays(todayLocal(), 2), horaInicio: "19:00", unitId: String(A) }));
    expect((await nots(bia)).map((n) => n.titulo)).toContain("Novo evento");
    await cancelEvent(coordA, id, "Chuva");
    expect((await nots(bia)).map((n) => n.titulo)).toContain("Evento cancelado");
    expect((await nots(beto)).map((n) => n.titulo)).not.toContain("Novo evento");
  });
  it("escala, tarefa e reunião avisam só os envolvidos", async () => {
    const s = await createShift(coordA, escalaSchema.parse({ unitId: String(serv), titulo: "Missa", data: addDays(todayLocal(), 4), horaInicio: "09:00", horaFim: "11:00" }));
    await assign(coordA, s, "ana@t.com", "Porta", false);
    expect((await nots(ana)).map((n) => n.titulo)).toContain("Você foi escalado(a)");
    expect((await nots(bia)).map((n) => n.titulo)).not.toContain("Você foi escalado(a)");
    await createTask(coordA, tarefaSchema.parse({ unitId: String(A), titulo: "Tarefa da Ana", responsavelEmail: "ana@t.com" }));
    expect((await nots(ana)).map((n) => n.titulo)).toContain("Nova tarefa para você");
    expect((await nots(bia)).map((n) => n.titulo)).not.toContain("Nova tarefa para você");
    await createMeeting(coordA, reuniaoSchema.parse({ unitId: String(A), titulo: "Reunião A", data: addDays(todayLocal(), 5), horaInicio: "20:00" }));
    expect((await nots(bia)).map((n) => n.titulo)).toContain("Nova reunião");
    expect((await nots(beto)).map((n) => n.titulo)).not.toContain("Nova reunião");
  });
  it("lançamento financeiro avisa só os aprovadores, sem valores nem nomes", async () => {
    const { contas, categorias } = await contasECategorias();
    await criarLancamento(fin1, lancamentoSchema.parse({ contaId: String(contas[0].id), categoriaId: String(categorias.find((c) => c.tipo === "entrada")!.id), tipo: "entrada", valor: "1.234,56", data: todayLocal(), descricao: "Dízimo da Fulana" }));
    expect((await aprovadoresFinanceiros(fin1)).sort()).toEqual([admin, fin2].sort());
    const f2 = await nots(fin2);
    expect(f2.map((n) => n.titulo)).toContain("Lançamento aguardando aprovação");
    expect(JSON.stringify(await query<any>("SELECT titulo, corpo FROM notificacoes WHERE tipo = 'financeiro'"))).not.toMatch(/1\.234|Fulana|R\$/);
    expect(await nots(ana)).not.toContainEqual(expect.objectContaining({ tipo: "financeiro" }));
    expect((await nots(fin1)).some((n) => n.tipo === "financeiro")).toBe(false);
  });
});

describe("preferências e horário de silêncio", () => {
  it("janela que cruza a meia-noite e janela no mesmo dia", () => {
    expect(emSilencio("23:30", "22:00", "07:00")).toBe(true); expect(emSilencio("06:59", "22:00", "07:00")).toBe(true);
    expect(emSilencio("07:00", "22:00", "07:00")).toBe(false); expect(emSilencio("12:00", "22:00", "07:00")).toBe(false);
    expect(emSilencio("13:00", "12:00", "14:00")).toBe(true); expect(emSilencio("15:00", "12:00", "14:00")).toBe(false);
    expect(emSilencio("03:00", null, null)).toBe(false);
  });
  it("salva e valida preferências", async () => {
    await salvarPreferencias(ana, { pushAtivo: false, silencioInicio: "22:00", silencioFim: "07:00", tipos: { evento: false } });
    expect(await preferencias(ana)).toMatchObject({ pushAtivo: false, silencioInicio: "22:00", silencioFim: "07:00", tipos: { evento: false, comunicado: true } });
    await expect(salvarPreferencias(ana, { pushAtivo: true, silencioInicio: "25:00", silencioFim: "07:00", tipos: {} })).rejects.toThrow();
    await expect(salvarPreferencias(ana, { pushAtivo: true, silencioInicio: "22:00", silencioFim: null, tipos: {} })).rejects.toThrow();
  });
});

describe("inscrições de dispositivos", () => {
  it("valida endpoint https e chaves", () => {
    expect(() => validarInscricao(sub(1))).not.toThrow();
    for (const ruim of [null, {}, { endpoint: "http://x.org", keys: sub(1).keys }, { endpoint: "javascript:alert(1)", keys: sub(1).keys }, { endpoint: sub(1).endpoint, keys: { p256dh: "<script>", auth: "x" } }, { endpoint: "https://x.org/" + "a".repeat(700), keys: sub(1).keys }]) expect(() => validarInscricao(ruim)).toThrow();
  });
  it("inscrever é idempotente; o dispositivo pertence a quem está logado; só o dono cancela", async () => {
    await inscrever(bia, sub(10), "UA"); await inscrever(bia, sub(10), "UA");
    expect(await dispositivos(bia)).toBe(1);
    await inscrever(beto, sub(10), "UA"); // mesmo aparelho, outra conta
    expect(await dispositivos(bia)).toBe(0); expect(await dispositivos(beto)).toBe(1);
    await cancelarInscricao(bia, sub(10).endpoint); expect(await dispositivos(beto)).toBe(1);
    await cancelarInscricao(beto, sub(10).endpoint); expect(await dispositivos(beto)).toBe(0);
  });
});

describe("entrega de Web Push", () => {
  const limpar = async () => { await execute("DELETE FROM push_entregas"); await execute("DELETE FROM notificacoes"); await execute("DELETE FROM push_subscriptions"); await execute("DELETE FROM notificacao_config"); await execute("DELETE FROM notificacao_tipos"); };
  const ok: Enviador = async () => ({ statusCode: 201 });
  it("envia uma vez por dispositivo e nunca duplica em nova execução", async () => {
    await limpar(); const enviados: string[] = [];
    definirEnviador(async (s, p) => { enviados.push(s.endpoint + "|" + JSON.parse(p).titulo); return { statusCode: 201 }; });
    await inscrever(ana, sub(20), null); await inscrever(ana, sub(21), null);
    await notificar([ana], { tipo: "sistema", titulo: "Olá", dedupeKey: "p1" });
    const r1 = await processarPush(); expect(r1.enviadas).toBe(2);
    const r2 = await processarPush(); expect(r2.processadas).toBe(0);
    expect(enviados).toHaveLength(2);
    expect((await query<any>("SELECT push_status FROM notificacoes"))[0].push_status).toBe("enviada");
  });
  it("respeita push desativado, tipo desligado e ausência de dispositivos", async () => {
    await limpar(); let chamadas = 0; definirEnviador(async () => { chamadas++; return { statusCode: 201 }; });
    await inscrever(ana, sub(30), null); await inscrever(bia, sub(31), null);
    await salvarPreferencias(ana, { pushAtivo: false, silencioInicio: null, silencioFim: null, tipos: {} });
    await salvarPreferencias(bia, { pushAtivo: true, silencioInicio: null, silencioFim: null, tipos: {} });
    await notificar([ana, bia, beto], { tipo: "sistema", titulo: "X", dedupeKey: "p2" });
    const r = await processarPush();
    expect(chamadas).toBe(1); expect(r.enviadas).toBe(1); expect(r.ignoradas).toBe(2);
  });
  it("horário de silêncio adia; passadas 24 h expira", async () => {
    await limpar(); let chamadas = 0; definirEnviador(async () => { chamadas++; return { statusCode: 201 }; });
    await inscrever(ana, sub(40), null);
    await salvarPreferencias(ana, { pushAtivo: true, silencioInicio: "00:00", silencioFim: "23:59", tipos: {} });
    await notificar([ana], { tipo: "sistema", titulo: "Silêncio", dedupeKey: "p3" });
    const r = await processarPush(); expect(chamadas).toBe(0); expect(r.adiadas).toBe(1);
    await execute("UPDATE notificacoes SET agendada_para = DATE_SUB(UTC_TIMESTAMP(), INTERVAL 30 HOUR)");
    expect((await processarPush()).expiradas).toBe(1);
  });
  it("inscrição expirada (410) é removida; erro do serviço conta falha e remove após 5", async () => {
    await limpar(); await inscrever(ana, sub(50), null);
    definirEnviador(async () => ({ statusCode: 410 }));
    await notificar([ana], { tipo: "sistema", titulo: "Gone", dedupeKey: "p4" });
    expect((await processarPush()).removidas).toBe(1); expect(await dispositivos(ana)).toBe(0);
    await inscrever(bia, sub(51), null); definirEnviador(async () => ({ statusCode: 500 }));
    for (let i = 0; i < 5; i++) { await notificar([bia], { tipo: "sistema", titulo: `F${i}`, dedupeKey: `pf${i}` }); await processarPush(); }
    expect(await dispositivos(bia)).toBe(0);
    expect((await query<any>("SELECT COUNT(*) n FROM push_entregas WHERE erro IS NOT NULL"))[0].n).toBeGreaterThanOrEqual(5);
  });
  it("exceção no envio é registrada sem derrubar o lote", async () => {
    await limpar(); await inscrever(ana, sub(60), null); await inscrever(bia, sub(61), null);
    definirEnviador(async (s) => { if (s.endpoint.endsWith("/60")) throw new Error("rede caiu"); return { statusCode: 201 }; });
    await notificar([ana, bia], { tipo: "sistema", titulo: "Lote", dedupeKey: "p5" });
    const r = await processarPush(); expect(r.falhas).toBe(1); expect(r.enviadas).toBe(1);
  });
  it("duas execuções simultâneas: apenas uma processa (bloqueio)", async () => {
    await limpar(); await inscrever(ana, sub(70), null); let chamadas = 0;
    definirEnviador(async () => { chamadas++; await new Promise((r) => setTimeout(r, 400)); return { statusCode: 201 }; });
    await notificar([ana], { tipo: "sistema", titulo: "Corrida", dedupeKey: "p6" });
    const [a, b] = await Promise.all([processarPush(), processarPush()]);
    expect([a.ocupado, b.ocupado].filter(Boolean)).toHaveLength(1); expect(chamadas).toBe(1);
  });
  it("sem Web Push configurado a execução falha de forma explícita", async () => {
    definirEnviador(null); const k = [process.env.VAPID_PUBLIC_KEY, process.env.VAPID_PRIVATE_KEY, process.env.VAPID_SUBJECT];
    delete process.env.VAPID_PUBLIC_KEY; delete process.env.VAPID_PRIVATE_KEY; delete process.env.VAPID_SUBJECT;
    expect(pushConfigurado()).toBe(false); await expect(processarPush()).rejects.toThrow(/não configurado/);
    [process.env.VAPID_PUBLIC_KEY, process.env.VAPID_PRIVATE_KEY, process.env.VAPID_SUBJECT] = k as string[];
    void ok;
  });
});

describe("segredo do agendador", () => {
  it("compara em tempo constante e nunca aceita segredo vazio ou curto", () => {
    const s = "segredo-de-teste-com-mais-de-24-caracteres";
    expect(segredoValido(s, s)).toBe(true); expect(segredoValido("errado", s)).toBe(false); expect(segredoValido(null, s)).toBe(false);
    expect(segredoValido("", "")).toBe(false); expect(segredoValido("curto", "curto")).toBe(false); expect(segredoValido("x", undefined)).toBe(false);
  });
});

describe("lembretes automáticos", () => {
  it("eventos: avisa quem confirmou, na antecedência definida, uma única vez", async () => {
    await execute("DELETE FROM notificacoes");
    const inicio = new Date(Date.now() + 30 * 60_000);
    const e = await execute("INSERT INTO events (unit_id, titulo, inicio, fim, lembrete_min, criado_por) VALUES (?, 'Missa de hoje', ?, ?, 60, ?)", [A, inicio, new Date(inicio.getTime() + 3600_000), admin]);
    const data = (await query<any>("SELECT DATE_FORMAT(CONVERT_TZ(?, '+00:00', '-03:00'), '%Y-%m-%d') d", [inicio]))[0].d;
    await execute("INSERT INTO event_rsvps (event_id, occurrence_date, user_id, status) VALUES (?,?,?, 'confirmado'), (?,?,?, 'nao_vai')", [e.insertId, data, ana, e.insertId, data, bia]);
    expect((await gerarLembretes()).eventos).toBe(1);
    expect((await gerarLembretes()).eventos).toBe(0);
    expect((await nots(ana)).map((n) => n.titulo)).toContain("Lembrete: Missa de hoje");
    expect((await nots(bia)).map((n) => n.titulo)).not.toContain("Lembrete: Missa de hoje");
    void rsvp;
  });
  it("escalas (24 h), reuniões (24 h) e tarefas (prazo hoje/amanhã) geram lembretes sem repetir", async () => {
    await execute("DELETE FROM notificacoes");
    const ini = new Date(Date.now() + 5 * 3600_000);
    const sh = await execute("INSERT INTO shifts (unit_id, titulo, inicio, fim, criado_por) VALUES (?, 'Escala próxima', ?, ?, ?)", [serv, ini, new Date(ini.getTime() + 3600_000), admin]);
    await execute("INSERT INTO shift_assignments (shift_id, user_id, status) VALUES (?, ?, 'confirmado')", [sh.insertId, ana]);
    const mt = await execute("INSERT INTO meetings (unit_id, titulo, inicio, criado_por) VALUES (?, 'Reunião próxima', ?, ?)", [A, ini, admin]);
    await execute("INSERT INTO meeting_participants (meeting_id, user_id) VALUES (?, ?)", [mt.insertId, bia]);
    await execute("INSERT INTO tasks (unit_id, titulo, prazo, responsavel_id, criado_por) VALUES (?, 'Tarefa de amanhã', ?, ?, ?)", [A, addDays(todayLocal(), 1), ana, admin]);
    const r = await gerarLembretes();
    expect([r.escalas, r.reunioes, r.tarefas]).toEqual([1, 1, 1]);
    const r2 = await gerarLembretes();
    expect([r2.escalas, r2.reunioes, r2.tarefas]).toEqual([0, 0, 0]);
  });
});
