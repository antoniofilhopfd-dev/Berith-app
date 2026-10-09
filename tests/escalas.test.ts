import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { closePool, query } from "@/lib/db";
import { ForbiddenError } from "@/lib/permissions";
import {
  assign, cancelShift, clearUnavailable, createShift, exportCsv, findConflicts, getShift, listMyAssignments, listShiftUnits,
  respond, setUnavailable, substitute, unassign,
} from "@/lib/services/escalas";
import { DomainError, NotFoundError } from "@/lib/services/errors";
import { escalaSchema } from "@/lib/validation/organizacao";
import { addDays, todayLocal } from "@/lib/time";
import { resetTestDb, criarUsuario, criarUnidade, darPapel, vincular } from "./helpers";

let admin = 0, respA = 0, respB = 0, ana = 0, bia = 0, caio = 0, fora = 0, A = 0, B = 0;
const dia = (n: number) => addDays(todayLocal(), n);
const esc = (o: Record<string, unknown> = {}) => escalaSchema.parse({ unitId: String(A), titulo: "Missa de domingo", data: dia(3), horaInicio: "09:00", horaFim: "11:00", ...o });

beforeAll(async () => {
  await resetTestDb();
  admin = await criarUsuario("adm@t.com"); respA = await criarUsuario("ra@t.com", "Resp A"); respB = await criarUsuario("rb@t.com", "Resp B");
  ana = await criarUsuario("ana@t.com", "Ana"); bia = await criarUsuario("bia@t.com", "Bia"); caio = await criarUsuario("caio@t.com", "Caio"); fora = await criarUsuario("fora@t.com", "Fora");
  await darPapel(admin, "admin_geral");
  A = await criarUnidade("servico", "Acolhida"); B = await criarUnidade("servico", "Som");
  await darPapel(respA, "resp_servico", A); await darPapel(respB, "resp_servico", B);
  for (const u of [ana, bia, caio]) await vincular(u, A);
  await vincular(fora, B);
});
afterAll(closePool);

describe("escalas: permissões por serviço", () => {
  it("responsável cria e administra só o próprio serviço", async () => {
    await expect(createShift(respA, esc({ unitId: String(B) }))).rejects.toThrow(ForbiddenError);
    await expect(createShift(ana, esc())).rejects.toThrow(ForbiddenError);
    expect(await createShift(respA, esc())).toBeGreaterThan(0);
  });
  it("escala de outro serviço por ID vira 'não encontrado'; listagem de serviços é filtrada", async () => {
    const id = await createShift(respA, esc({ titulo: "Só Acolhida" }));
    await expect(getShift(respB, id)).rejects.toThrow(NotFoundError);
    await expect(getShift(fora, id)).rejects.toThrow(NotFoundError);
    expect((await getShift(ana, id)).escala.titulo).toBe("Só Acolhida"); // integrante vê
    expect((await listShiftUnits(ana)).map((u) => u.id)).toEqual([A]);
    expect((await listShiftUnits(fora)).map((u) => u.id)).toEqual([B]);
  });
  it("valida horário", async () => {
    await expect(createShift(respA, esc({ horaFim: "08:00" }))).rejects.toThrow(DomainError);
  });
});

describe("escalas: escalação, confirmação e conflitos", () => {
  let s1 = 0;
  beforeAll(async () => { s1 = await createShift(respA, esc({ titulo: "Domingo manhã", data: dia(5) })); });
  it("só quem edita escala; a pessoa precisa ser integrante do serviço", async () => {
    await expect(assign(ana, s1, "bia@t.com", null, false)).rejects.toThrow(ForbiddenError);
    await expect(assign(respB, s1, "bia@t.com", null, false)).rejects.toThrow(NotFoundError);
    await expect(assign(respA, s1, "fora@t.com", null, false)).rejects.toThrow(/integrante/);
    await assign(respA, s1, "ana@t.com", "Porta", false);
    await expect(assign(respA, s1, "ana@t.com", null, false)).rejects.toThrow(/já está/);
  });
  it("bloqueia conflito de horário entre escalas da mesma pessoa", async () => {
    const s2 = await createShift(respA, esc({ titulo: "Sobreposta", data: dia(5), horaInicio: "10:00", horaFim: "12:00" }));
    await expect(assign(respA, s2, "ana@t.com", null, false)).rejects.toThrow(/Conflito de horário/);
    const s3 = await createShift(respA, esc({ titulo: "Depois", data: dia(5), horaInicio: "11:00", horaFim: "12:00" }));
    await assign(respA, s3, "ana@t.com", null, false); // horários adjacentes não conflitam
  });
  it("indisponibilidade informada bloqueia, a menos que o responsável force", async () => {
    const s = await createShift(respA, esc({ titulo: "Dia da Bia", data: dia(8) }));
    await setUnavailable(bia, dia(8), "Viagem");
    await expect(assign(respA, s, "bia@t.com", null, false)).rejects.toThrow(/indisponibilidade/);
    await assign(respA, s, "bia@t.com", null, true);
    expect((await findConflicts(bia, new Date(Date.now() + 8 * 86400_000), new Date(Date.now() + 8 * 86400_000 + 3600_000))).indisp.length).toBeGreaterThanOrEqual(0);
    await clearUnavailable(bia, dia(8));
  });
  it("a pessoa confirma ou recusa apenas a própria escalação", async () => {
    const [a] = await query<any>("SELECT id FROM shift_assignments WHERE shift_id = ? AND user_id = ?", [s1, ana]);
    await expect(respond(bia, a.id, "confirmado", null)).rejects.toThrow(NotFoundError);
    await expect(respond(respA, a.id, "confirmado", null)).rejects.toThrow(NotFoundError); // nem o responsável responde por ela
    await respond(ana, a.id, "confirmado", null);
    expect((await getShift(respA, s1)).atribuicoes.find((x) => x.user_id === ana)!.status).toBe("confirmado");
    expect((await listMyAssignments(ana, new Date())).some((x) => x.id === s1)).toBe(true);
  });
  it("recusa com motivo libera conflito; substituição troca a pessoa", async () => {
    const [a] = await query<any>("SELECT id FROM shift_assignments WHERE shift_id = ? AND user_id = ?", [s1, ana]);
    await expect(substitute(ana, a.id, "caio@t.com", false)).rejects.toThrow(ForbiddenError);
    await expect(substitute(respA, a.id, "ana@t.com", false)).rejects.toThrow(DomainError);
    await substitute(respA, a.id, "caio@t.com", false);
    const at = (await getShift(respA, s1)).atribuicoes;
    expect(at.find((x) => x.user_id === ana)!.status).toBe("substituido");
    expect(at.find((x) => x.user_id === caio)!.status).toBe("pendente");
    expect((await listMyAssignments(ana, new Date())).some((x) => x.id === s1)).toBe(false);
    const [c] = await query<any>("SELECT id FROM shift_assignments WHERE shift_id = ? AND user_id = ?", [s1, caio]);
    await respond(caio, c.id, "recusado", "Compromisso");
    expect((await getShift(respA, s1)).atribuicoes.find((x) => x.user_id === caio)!.motivo).toBe("Compromisso");
  });
  it("saiu da estrutura: deixa de ver as próprias escalas (acesso revogado)", async () => {
    const [m] = await query<any>("SELECT id FROM memberships WHERE user_id = ? AND unit_id = ?", [bia, A]);
    expect((await listMyAssignments(bia, new Date())).length).toBeGreaterThan(0);
    await query("UPDATE memberships SET fim = UTC_DATE() WHERE id = ?", [m.id]);
    expect(await listMyAssignments(bia, new Date())).toEqual([]);
    await expect(getShift(bia, s1)).rejects.toThrow(NotFoundError);
  });
  it("cancelar escala impede nova escalação e remove das escalas pessoais", async () => {
    const s = await createShift(respA, esc({ titulo: "Cancelável", data: dia(20) }));
    await assign(respA, s, "ana@t.com", null, false);
    await cancelShift(respA, s);
    await expect(assign(respA, s, "caio@t.com", null, false)).rejects.toThrow(/cancelada/);
    expect((await listMyAssignments(ana, new Date())).some((x) => x.id === s)).toBe(false);
    await expect(cancelShift(ana, s)).rejects.toThrow(ForbiddenError);
  });
  it("remover escalação exige permissão", async () => {
    const s = await createShift(respA, esc({ titulo: "Remover", data: dia(22) }));
    await assign(respA, s, "caio@t.com", null, false);
    const [a] = await query<any>("SELECT id FROM shift_assignments WHERE shift_id = ?", [s]);
    await expect(unassign(ana, a.id)).rejects.toThrow(ForbiddenError);
    await unassign(respA, a.id);
    expect((await getShift(respA, s)).atribuicoes).toEqual([]);
  });
});

describe("escalas: exportação", () => {
  it("só quem exporta; CSV neutraliza fórmulas e usa BOM para Excel", async () => {
    const s = await createShift(respA, esc({ titulo: "=HYPERLINK(\"http://x\")", data: dia(30) }));
    await assign(respA, s, "caio@t.com", "+cmd", false);
    await expect(exportCsv(ana, A, new Date(), new Date(Date.now() + 40 * 86400_000))).rejects.toThrow(ForbiddenError);
    await expect(exportCsv(respB, A, new Date(), new Date(Date.now() + 40 * 86400_000))).rejects.toThrow(ForbiddenError);
    const csv = await exportCsv(respA, A, new Date(), new Date(Date.now() + 40 * 86400_000));
    expect(csv.startsWith("﻿Escala;")).toBe(true);
    expect(csv).toContain(`"'=HYPERLINK`);
    expect(csv).toContain(`"'+cmd"`);
  });
});
