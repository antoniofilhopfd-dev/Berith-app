import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { closePool, query } from "@/lib/db";
import { ForbiddenError } from "@/lib/permissions";
import { comment, createTask, getTask, listTasks, setStatus, updateTask } from "@/lib/services/tarefas";
import { addDecision, createMeeting, getMeeting, listMeetings, saveMinutes } from "@/lib/services/reunioes";
import { DomainError, NotFoundError } from "@/lib/services/errors";
import { decisaoSchema, reuniaoSchema, tarefaSchema } from "@/lib/validation/organizacao";
import { addDays, todayLocal } from "@/lib/time";
import { resetTestDb, criarUsuario, criarUnidade, darPapel, vincular } from "./helpers";

let admin = 0, coordA = 0, coordB = 0, ana = 0, bia = 0, ben = 0, A = 0, B = 0;
const t = (o: Record<string, unknown> = {}) => tarefaSchema.parse({ unitId: String(A), titulo: "Preparar o retiro", ...o });

beforeAll(async () => {
  await resetTestDb();
  admin = await criarUsuario("adm@t.com"); coordA = await criarUsuario("ca@t.com", "Coord A"); coordB = await criarUsuario("cb@t.com", "Coord B");
  ana = await criarUsuario("ana@t.com", "Ana"); bia = await criarUsuario("bia@t.com", "Bia"); ben = await criarUsuario("ben@t.com", "Ben");
  await darPapel(admin, "admin_geral");
  A = await criarUnidade("ministerio", "A"); B = await criarUnidade("ministerio", "B");
  await darPapel(coordA, "coord_ministerio", A); await darPapel(coordB, "coord_ministerio", B);
  await vincular(ana, A); await vincular(bia, A); await vincular(ben, B);
});
afterAll(closePool);

describe("tarefas", () => {
  it("só a coordenação cria; responsável precisa ser integrante da estrutura", async () => {
    await expect(createTask(ana, t())).rejects.toThrow(ForbiddenError);
    await expect(createTask(coordA, t({ unitId: String(B) }))).rejects.toThrow(ForbiddenError);
    await expect(createTask(coordA, t({ responsavelEmail: "ben@t.com" }))).rejects.toThrow(/integrante/);
    expect(await createTask(coordA, t({ responsavelEmail: "ana@t.com", prazo: addDays(todayLocal(), 4), prioridade: "alta" }))).toBeGreaterThan(0);
  });
  it("visibilidade: estrutura própria sim, outra estrutura não; responsável sempre vê a sua", async () => {
    const id = await createTask(coordA, t({ titulo: "Só da A", responsavelEmail: "ana@t.com" }));
    expect((await getTask(bia, id)).tarefa.titulo).toBe("Só da A");
    await expect(getTask(ben, id)).rejects.toThrow(NotFoundError);
    await expect(getTask(coordB, id)).rejects.toThrow(NotFoundError);
    expect((await listTasks(ben, "estruturas")).map((x) => x.titulo)).not.toContain("Só da A");
    expect((await listTasks(ana, "minhas")).map((x) => x.titulo)).toContain("Só da A");
    expect((await listTasks(coordB, "estruturas")).map((x) => x.titulo)).not.toContain("Só da A");
  });
  it("responsável altera o andamento mas não edita nem cancela; terceiros não mexem", async () => {
    const id = await createTask(coordA, t({ titulo: "Andamento", responsavelEmail: "ana@t.com" }));
    await setStatus(ana, id, "em_andamento");
    await setStatus(ana, id, "concluida");
    await expect(setStatus(ana, id, "cancelada")).rejects.toThrow(DomainError);
    await expect(updateTask(ana, id, { titulo: "x", descricao: null, prazo: undefined, prioridade: "baixa", responsavelEmail: undefined })).rejects.toThrow(ForbiddenError);
    await expect(setStatus(bia, id, "concluida")).rejects.toThrow(NotFoundError);
    await expect(setStatus(ben, id, "concluida")).rejects.toThrow(NotFoundError);
    const d = await getTask(coordA, id);
    expect(d.tarefa.status).toBe("concluida");
    expect(d.historico.map((h) => h.acao)).toContain("status");
  });
  it("comentários exigem acesso à tarefa e ficam no histórico", async () => {
    const id = await createTask(coordA, t({ titulo: "Comentada" }));
    await comment(bia, id, "Posso ajudar com isso.");
    await expect(comment(ben, id, "intruso")).rejects.toThrow(NotFoundError);
    expect((await getTask(coordA, id)).comentarios.map((c) => c.texto)).toEqual(["Posso ajudar com isso."]);
  });
  it("tarefa atrasada é sinalizada; concluída não", async () => {
    const id = await createTask(coordA, t({ titulo: "Atrasada", prazo: addDays(todayLocal(), 2) }));
    await query("UPDATE tasks SET prazo = DATE_SUB(UTC_DATE(), INTERVAL 3 DAY) WHERE id = ?", [id]);
    expect(Number((await getTask(coordA, id)).tarefa.atrasada)).toBe(1);
    await setStatus(coordA, id, "concluida");
    expect(Number((await getTask(coordA, id)).tarefa.atrasada)).toBe(0);
  });
});

describe("reuniões e decisões", () => {
  let m = 0;
  const r = (o: Record<string, unknown> = {}) => reuniaoSchema.parse({ unitId: String(A), titulo: "Reunião mensal", data: addDays(todayLocal(), 2), horaInicio: "20:00", pauta: "1. Retiro\n2. Finanças", ...o });
  it("só a coordenação cria; participantes são os integrantes ativos", async () => {
    await expect(createMeeting(ana, r())).rejects.toThrow(ForbiddenError);
    await expect(createMeeting(coordA, r({ unitId: String(B) }))).rejects.toThrow(ForbiddenError);
    m = await createMeeting(coordA, r());
    expect((await getMeeting(coordA, m)).participantes.map((p) => p.nome)).toEqual(["Ana", "Bia"]);
  });
  it("visibilidade por estrutura: integrante vê; de outra estrutura não", async () => {
    expect((await getMeeting(ana, m)).reuniao.titulo).toBe("Reunião mensal");
    await expect(getMeeting(ben, m)).rejects.toThrow(NotFoundError);
    await expect(getMeeting(coordB, m)).rejects.toThrow(NotFoundError);
    expect((await listMeetings(ben)).map((x) => x.id)).not.toContain(m);
    expect((await listMeetings(ana)).map((x) => x.id)).toContain(m);
  });
  it("ata e decisões exigem permissão de edição", async () => {
    await expect(saveMinutes(ana, m, "ata", "realizada")).rejects.toThrow(ForbiddenError);
    await saveMinutes(coordA, m, "Aprovado o retiro.", "realizada");
    expect((await getMeeting(ana, m)).reuniao.ata).toBe("Aprovado o retiro.");
    await expect(addDecision(ana, decisaoSchema.parse({ meetingId: String(m), texto: "Decisão inválida" }))).rejects.toThrow(ForbiddenError);
  });
  it("decisão gera tarefa vinculada à reunião, com responsável e prazo", async () => {
    const taskId = await addDecision(coordA, decisaoSchema.parse({ meetingId: String(m), texto: "Reservar a casa de retiros", gerarTarefa: "on", responsavelEmail: "bia@t.com", prazo: addDays(todayLocal(), 10) }));
    expect(taskId).toBeGreaterThan(0);
    const d = await getTask(bia, taskId!);
    expect(d.tarefa).toMatchObject({ titulo: "Reservar a casa de retiros", responsavel_nome: "Bia", meeting_id: m });
    const sem = await addDecision(coordA, decisaoSchema.parse({ meetingId: String(m), texto: "Apenas registrar" }));
    expect(sem).toBeNull();
    const dec = (await getMeeting(coordA, m)).decisoes;
    expect(dec).toHaveLength(2);
    expect(dec[0].task_id).toBe(taskId);
  });
  it("decisão com responsável de fora da estrutura falha sem criar nada pela metade", async () => {
    await expect(addDecision(coordA, decisaoSchema.parse({ meetingId: String(m), texto: "Tarefa para o Ben", gerarTarefa: "on", responsavelEmail: "ben@t.com" }))).rejects.toThrow(DomainError);
    expect((await getMeeting(coordA, m)).decisoes).toHaveLength(2);
  });
});
