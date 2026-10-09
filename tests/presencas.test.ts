import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { closePool, execute } from "@/lib/db";
import { ForbiddenError } from "@/lib/permissions";
import { addByEmail, checkin, checkinToken, corrections, mark, myHistory, report, sheet } from "@/lib/services/presencas";
import { createEvent } from "@/lib/services/eventos";
import { DomainError, NotFoundError } from "@/lib/services/errors";
import { eventoSchema } from "@/lib/validation/eventos";
import { addDays, todayLocal } from "@/lib/time";
import { resetTestDb, criarUsuario, criarUnidade, darPapel, vincular } from "./helpers";

let admin = 0, coordA = 0, coordB = 0, ana = 0, bia = 0, outra = 0, A = 0, B = 0, evA = 0;
const hoje = todayLocal();

async function eventoHoje(unit: number, hora: string, titulo = "Encontro de hoje") {
  const r = await execute("INSERT INTO events (unit_id, titulo, inicio, fim, criado_por) VALUES (?,?,?,?,?)",
    [unit, titulo, new Date(Date.now() - 30 * 60_000), new Date(Date.now() + 90 * 60_000), admin]);
  return r.insertId;
}

beforeAll(async () => {
  await resetTestDb();
  admin = await criarUsuario("adm@t.com"); coordA = await criarUsuario("ca@t.com", "Coord A"); coordB = await criarUsuario("cb@t.com", "Coord B");
  ana = await criarUsuario("ana@t.com", "Ana"); bia = await criarUsuario("bia@t.com", "Bia"); outra = await criarUsuario("o@t.com", "Outra");
  await darPapel(admin, "admin_geral");
  A = await criarUnidade("ministerio", "A"); B = await criarUnidade("ministerio", "B");
  await darPapel(coordA, "coord_ministerio", A); await darPapel(coordB, "coord_ministerio", B);
  await vincular(ana, A); await vincular(bia, A);
  evA = await eventoHoje(A, "agora");
});
afterAll(closePool);

describe("presenças", () => {
  it("chamada só para quem gerencia a estrutura do evento", async () => {
    await expect(sheet(ana, evA, hoje)).rejects.toThrow(ForbiddenError);
    await expect(sheet(coordB, evA, hoje)).rejects.toThrow(NotFoundError);
    const s = await sheet(coordA, evA, hoje);
    expect(s.linhas.map((l) => l.nome).sort()).toEqual(["Ana", "Bia"]);
  });
  it("registra presença; integrante comum não registra nem vê a lista", async () => {
    await expect(mark(ana, evA, hoje, bia, true, null)).rejects.toThrow(ForbiddenError);
    await mark(coordA, evA, hoje, ana, true, null);
    expect((await sheet(coordA, evA, hoje)).presentes).toBe(1);
  });
  it("correção exige motivo e fica registrada com antes/depois", async () => {
    await expect(mark(coordA, evA, hoje, ana, false, null)).rejects.toThrow(/motivo/);
    await mark(coordA, evA, hoje, ana, false, "Saiu antes do início");
    const c = await corrections(coordA, evA, hoje);
    expect(c).toHaveLength(1);
    expect([c[0].antes, c[0].depois, c[0].motivo]).toEqual([1, 0, "Saiu antes do início"]);
    await mark(coordA, evA, hoje, ana, false, null); // mesmo valor: sem alteração
    expect(await corrections(coordA, evA, hoje)).toHaveLength(1);
    await expect(corrections(ana, evA, hoje)).rejects.toThrow(ForbiddenError);
  });
  it("não aceita data futura distante, data inválida nem evento cancelado", async () => {
    const futuro = await createEvent(coordA, eventoSchema.parse({ titulo: "Futuro", data: addDays(hoje, 5), horaInicio: "19:00", unitId: String(A) }));
    await expect(mark(coordA, futuro, addDays(hoje, 5), ana, true, null)).rejects.toThrow(/perto do horário/);
    await expect(mark(coordA, evA, addDays(hoje, 1), ana, true, null)).rejects.toThrow(DomainError);
    const canc = await eventoHoje(A, "x", "Cancelado"); await execute("UPDATE events SET cancelado_em = UTC_TIMESTAMP() WHERE id = ?", [canc]);
    await expect(mark(coordA, canc, hoje, ana, true, null)).rejects.toThrow(/cancelado/);
  });
  it("adiciona participante por e-mail (visitante) e confirma quem respondeu 'vou'", async () => {
    await addByEmail(coordA, evA, hoje, "o@t.com");
    expect((await sheet(coordA, evA, hoje)).linhas.some((l) => l.nome === "Outra" && l.presente === 1)).toBe(true);
    await expect(addByEmail(coordA, evA, hoje, "nao@t.com")).rejects.toThrow(DomainError);
  });
  it("histórico individual mostra só a própria participação", async () => {
    await mark(coordA, evA, hoje, bia, true, null);
    expect((await myHistory(bia)).map((h) => h.titulo)).toEqual(["Encontro de hoje"]);
    expect(await myHistory(coordB)).toEqual([]);
  });
  it("relatório é agregado, restrito à estrutura e sem nomes", async () => {
    await expect(report(ana, A, hoje, hoje)).rejects.toThrow(ForbiddenError);
    await expect(report(coordB, A, hoje, hoje)).rejects.toThrow(ForbiddenError);
    const r = await report(coordA, A, addDays(hoje, -1), addDays(hoje, 1));
    expect(r[0]).toMatchObject({ titulo: "Encontro de hoje" });
    expect(JSON.stringify(r)).not.toContain("Bia");
  });
});

describe("check-in por QR Code", () => {
  it("token assinado permite o próprio check-in; adulterado ou de outro evento é recusado", async () => {
    const t = await checkinToken(coordA, evA, hoje);
    expect((await checkin(bia, t)).jaRegistrado).toBe(true); // Bia já tinha sido marcada
    const ev2 = await eventoHoje(A, "x", "Outro encontro");
    const t2 = await checkinToken(coordA, ev2, hoje);
    expect((await checkin(ana, t2)).jaRegistrado).toBe(false);
    await expect(checkin(ana, t2.slice(0, -2) + "xx")).rejects.toThrow(NotFoundError);
    await expect(checkin(ana, "lixo")).rejects.toThrow(NotFoundError);
    const [b] = t.split(".");
    await expect(checkin(ana, `${b}.assinaturafalsa`)).rejects.toThrow(NotFoundError);
  });
  it("só quem registra presença gera o QR; quem não enxerga o evento não faz check-in", async () => {
    await expect(checkinToken(ana, evA, hoje)).rejects.toThrow(ForbiddenError);
    const t = await checkinToken(coordA, evA, hoje);
    await expect(checkin(coordB, t)).rejects.toThrow(NotFoundError);
  });
  it("QR expirado é recusado", async () => {
    const t = await checkinToken(coordA, evA, hoje);
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.now() + 8 * 3600_000);
    try { await expect(checkin(ana, t)).rejects.toThrow(/expirou/); } finally { vi.useRealTimers(); }
  });
  it("QR de uma data não vale para outra data do mesmo evento", async () => {
    const t = await checkinToken(coordA, evA, hoje);
    const [b, sig] = t.split(".");
    const adulterado = Buffer.from(Buffer.from(b, "base64url").toString().replace(hoje, addDays(hoje, 1))).toString("base64url");
    await expect(checkin(ana, `${adulterado}.${sig}`)).rejects.toThrow(NotFoundError);
  });
});
