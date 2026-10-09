import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { closePool, execute, query } from "@/lib/db";
import { ForbiddenError } from "@/lib/permissions";
import {
  cancelEvent, cancelOccurrence, createEvent, eventHistory, getEvent, listOccurrences, rsvp, rsvpSummary, updateEvent,
} from "@/lib/services/eventos";
import { DomainError, NotFoundError } from "@/lib/services/errors";
import { eventoSchema } from "@/lib/validation/eventos";
import { addDays, localToUtc, todayLocal } from "@/lib/time";
import { resetTestDb, criarUsuario, criarUnidade, darPapel, vincular } from "./helpers";

let admin = 0, coordA = 0, coordB = 0, membroA = 0, membroB = 0, sem = 0, A = 0, B = 0, sub = 0;
const amanha = () => addDays(todayLocal(), 1);
const ev = (o: Record<string, unknown> = {}) => eventoSchema.parse({ titulo: "Encontro", data: amanha(), horaInicio: "19:00", unitId: String(A), ...o });
const janela = () => [new Date(), new Date(Date.now() + 90 * 86400_000)] as const;

beforeAll(async () => {
  await resetTestDb();
  admin = await criarUsuario("a@t.com", "Admin"); coordA = await criarUsuario("ca@t.com", "Coord A"); coordB = await criarUsuario("cb@t.com", "Coord B");
  membroA = await criarUsuario("ma@t.com", "Maria A"); membroB = await criarUsuario("mb@t.com", "Beto B"); sem = await criarUsuario("s@t.com", "Sem vínculo");
  await darPapel(admin, "admin_geral");
  A = await criarUnidade("ministerio", "A"); B = await criarUnidade("ministerio", "B"); sub = await criarUnidade("grupo", "SubA", A);
  await darPapel(coordA, "coord_ministerio", A); await darPapel(coordB, "coord_ministerio", B);
  await vincular(membroA, A); await vincular(membroB, B);
});
afterAll(closePool);

describe("eventos: criação e escopo", () => {
  it("coordenador cria na própria estrutura, mas não em outra nem para toda a comunidade", async () => {
    expect(await createEvent(coordA, ev())).toBeGreaterThan(0);
    await expect(createEvent(coordA, ev({ unitId: String(B) }))).rejects.toThrow(ForbiddenError);
    await expect(createEvent(coordA, ev({ unitId: "" }))).rejects.toThrow(ForbiddenError);
    await expect(createEvent(membroA, ev())).rejects.toThrow(ForbiddenError);
  });
  it("papel global cria evento para toda a comunidade", async () => {
    const id = await createEvent(admin, ev({ unitId: "", titulo: "Missa da comunidade" }));
    expect((await getEvent(sem, id)).titulo).toBe("Missa da comunidade"); // visível a qualquer membro ativo
  });
  it("valida horários e recorrência", async () => {
    await expect(createEvent(coordA, ev({ horaFim: "18:00" }))).rejects.toThrow(DomainError);
    await expect(createEvent(coordA, ev({ recorrencia: "semanal" }))).rejects.toThrow(/até quando/);
    await expect(createEvent(coordA, ev({ recorrencia: "semanal", recorrenciaAte: addDays(amanha(), 900) }))).rejects.toThrow(/2 anos/);
    expect(() => eventoSchema.parse({ titulo: "x", data: "2026-02-30", horaInicio: "10:00" })).toThrow();
  });
});

describe("eventos: visibilidade (URL direta e listagem)", () => {
  let idA = 0;
  beforeAll(async () => { idA = await createEvent(coordA, ev({ titulo: "Reunião A" })); });
  it("integrante vê o evento da própria estrutura; de outra estrutura vira 'não encontrado'", async () => {
    expect((await getEvent(membroA, idA)).id).toBe(idA);
    await expect(getEvent(membroB, idA)).rejects.toThrow(NotFoundError);
    await expect(getEvent(coordB, idA)).rejects.toThrow(NotFoundError);
    await expect(getEvent(sem, idA)).rejects.toThrow(NotFoundError);
    expect((await getEvent(admin, idA)).id).toBe(idA);
  });
  it("listagem só traz o que o usuário pode ver", async () => {
    const [f, t] = janela();
    const titulos = async (u: number) => (await listOccurrences(u, f, t)).map((o) => o.evento.titulo);
    expect(await titulos(membroA)).toContain("Reunião A");
    expect(await titulos(membroB)).not.toContain("Reunião A");
    expect(await titulos(sem)).not.toContain("Reunião A");
    expect(await titulos(sem)).toContain("Missa da comunidade");
  });
  it("coordenação do pai enxerga eventos de subestruturas", async () => {
    const id = await createEvent(coordA, ev({ unitId: String(sub), titulo: "Ensaio SubA" }));
    expect((await getEvent(coordA, id)).titulo).toBe("Ensaio SubA");
    await expect(getEvent(membroA, id)).rejects.toThrow(NotFoundError); // integrante do pai não herda o grupo
  });
});

describe("eventos: edição, cancelamento e histórico", () => {
  it("somente quem gerencia edita; alteração fica no histórico", async () => {
    const id = await createEvent(coordA, ev({ titulo: "Antes" }));
    await expect(updateEvent(membroA, id, ev({ titulo: "Hack" }))).rejects.toThrow(ForbiddenError);
    await expect(updateEvent(coordB, id, ev({ titulo: "Hack" }))).rejects.toThrow(NotFoundError);
    await updateEvent(coordA, id, ev({ titulo: "Depois", local: "Salão" }));
    expect((await getEvent(coordA, id)).titulo).toBe("Depois");
    const h = await eventHistory(coordA, id);
    expect(h.map((x) => x.acao)).toEqual(["editado", "criado"]);
    await expect(eventHistory(membroA, id)).rejects.toThrow(ForbiddenError);
  });
  it("cancelar impede edição e confirmação", async () => {
    const id = await createEvent(coordA, ev());
    await cancelEvent(coordA, id, "Chuva");
    await expect(updateEvent(coordA, id, ev())).rejects.toThrow(DomainError);
    await expect(rsvp(membroA, id, amanha(), "confirmado")).rejects.toThrow(/cancelado/);
  });
  it("cancelar uma ocorrência da série mantém as demais", async () => {
    const id = await createEvent(coordA, ev({ recorrencia: "semanal", recorrenciaAte: addDays(amanha(), 30) }));
    const d2 = addDays(amanha(), 7);
    await cancelOccurrence(coordA, id, d2, null);
    await expect(cancelOccurrence(coordA, id, addDays(amanha(), 3), null)).rejects.toThrow(DomainError);
    const [f, t] = janela();
    const mine = (await listOccurrences(membroA, f, t)).filter((o) => o.evento.id === id);
    expect(mine.find((o) => o.date === d2)!.cancelada).toBe(true);
    expect(mine.find((o) => o.date === amanha())!.cancelada).toBe(false);
    await expect(rsvp(membroA, id, d2, "confirmado")).rejects.toThrow(/cancelada/);
    await rsvp(membroA, id, addDays(d2, 7), "confirmado");
  });
});

describe("eventos: confirmações e privacidade", () => {
  it("limite de vagas é respeitado, inclusive sob concorrência", async () => {
    const id = await createEvent(coordA, ev({ limite: "2" }));
    const extras = await Promise.all([1, 2, 3, 4].map((i) => criarUsuario(`x${i}@t.com`)));
    await Promise.all(extras.map((u) => vincular(u, A)));
    const r = await Promise.allSettled(extras.map((u) => rsvp(u, id, amanha(), "confirmado")));
    expect(r.filter((x) => x.status === "fulfilled")).toHaveLength(2);
    expect((await rsvpSummary(coordA, id, amanha())).confirmado).toBe(2);
  });
  it("quem já confirmou pode mudar a resposta mesmo com lotação; quem sai libera vaga", async () => {
    const id = await createEvent(coordA, ev({ limite: "1" }));
    await rsvp(membroA, id, amanha(), "confirmado");
    await rsvp(membroA, id, amanha(), "confirmado");
    await expect(rsvp(coordA, id, amanha(), "confirmado")).rejects.toThrow(/Vagas/);
    await rsvp(membroA, id, amanha(), "nao_vai");
    await rsvp(coordA, id, amanha(), "confirmado");
  });
  it("não confirma presença em evento que não vê, em data inválida ou já passada", async () => {
    const id = await createEvent(coordA, ev({ recorrencia: "semanal", recorrenciaAte: addDays(amanha(), 20) }));
    await expect(rsvp(membroB, id, amanha(), "confirmado")).rejects.toThrow(NotFoundError);
    await expect(rsvp(membroA, id, addDays(amanha(), 2), "confirmado")).rejects.toThrow(DomainError);
    const passado = await execute(
      `INSERT INTO events (unit_id, titulo, inicio, criado_por) VALUES (?, 'Passado', ?, ?)`, [A, localToUtc(addDays(todayLocal(), -3), "10:00"), admin]);
    await expect(rsvp(membroA, passado.insertId, addDays(todayLocal(), -3), "confirmado")).rejects.toThrow(/já aconteceu/);
  });
  it("nomes dos participantes só aparecem para a organização", async () => {
    const id = await createEvent(coordA, ev());
    await rsvp(membroA, id, amanha(), "confirmado");
    const visaoMembro = await rsvpSummary(membroA, id, amanha());
    expect(visaoMembro.confirmado).toBe(1);
    expect(visaoMembro.nomes).toBeUndefined();
    expect((await rsvpSummary(coordA, id, amanha())).nomes?.map((n) => n.nome)).toEqual(["Maria A"]);
  });
  it("limite não pode ficar abaixo das confirmações existentes", async () => {
    const id = await createEvent(coordA, ev({ limite: "5" }));
    await rsvp(membroA, id, amanha(), "confirmado"); await rsvp(coordA, id, amanha(), "confirmado");
    await expect(updateEvent(coordA, id, ev({ limite: "1" }))).rejects.toThrow(/limite/);
  });
  it("consultas parametrizadas: título com SQL é tratado como texto", async () => {
    const id = await createEvent(coordA, ev({ titulo: "x'); DROP TABLE events;--" }));
    expect((await getEvent(coordA, id)).titulo).toContain("DROP TABLE");
    expect((await query<any>("SELECT COUNT(*) n FROM events"))[0].n).toBeGreaterThan(0);
  });
});
