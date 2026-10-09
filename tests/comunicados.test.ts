import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { closePool, execute } from "@/lib/db";
import { ForbiddenError } from "@/lib/permissions";
import { confirmRead, createComunicado, deleteComunicado, getComunicado, listForUser, listManaged, readStats, unreadCount } from "@/lib/services/comunicados";
import { NotFoundError, DomainError } from "@/lib/services/errors";
import { comunicadoSchema } from "@/lib/validation/eventos";
import { addDays, todayLocal } from "@/lib/time";
import { resetTestDb, criarUsuario, criarUnidade, darPapel, vincular } from "./helpers";

let admin = 0, com = 0, coordA = 0, membroA = 0, membroB = 0, A = 0, B = 0;
const c = (o: Record<string, unknown> = {}) => comunicadoSchema.parse({ titulo: "Aviso", corpo: "Texto do aviso", unitId: String(A), ...o });

beforeAll(async () => {
  await resetTestDb();
  admin = await criarUsuario("a@t.com"); com = await criarUsuario("com@t.com"); coordA = await criarUsuario("ca@t.com");
  membroA = await criarUsuario("ma@t.com", "Maria A"); membroB = await criarUsuario("mb@t.com", "Beto B");
  await darPapel(admin, "admin_geral"); await darPapel(com, "resp_comunicacao");
  A = await criarUnidade("ministerio", "A"); B = await criarUnidade("ministerio", "B");
  await darPapel(coordA, "coord_ministerio", A);
  await vincular(membroA, A); await vincular(membroB, B);
});
afterAll(closePool);

describe("comunicados", () => {
  it("somente autorizados publicam, por público", async () => {
    await expect(createComunicado(membroA, c())).rejects.toThrow(ForbiddenError);
    await expect(createComunicado(coordA, c({ unitId: String(B) }))).rejects.toThrow(ForbiddenError);
    await expect(createComunicado(coordA, c({ unitId: "" }))).rejects.toThrow(ForbiddenError);
    expect(await createComunicado(coordA, c())).toBeGreaterThan(0);
    expect(await createComunicado(com, c({ unitId: "", titulo: "Geral" }))).toBeGreaterThan(0); // comunicação publica para todos
  });
  it("destinatários: integrante vê o da sua estrutura e os gerais, nunca os de outra", async () => {
    const t = async (u: number) => (await listForUser(u)).map((a) => a.titulo).sort();
    expect(await t(membroA)).toEqual(["Aviso", "Geral"]);
    expect(await t(membroB)).toEqual(["Geral"]);
    expect(await t(coordA)).toEqual(["Aviso", "Geral"]);
  });
  it("URL direta de comunicado alheio vira 'não encontrado'", async () => {
    const id = await createComunicado(coordA, c({ titulo: "Só A" }));
    await expect(getComunicado(membroB, id)).rejects.toThrow(NotFoundError);
    await expect(confirmRead(membroB, id)).rejects.toThrow(NotFoundError);
    expect((await getComunicado(membroA, id)).titulo).toBe("Só A");
  });
  it("agendado e expirado não aparecem para destinatários, mas aparecem para quem gerencia", async () => {
    const futuro = await createComunicado(coordA, c({ titulo: "Futuro", publicarData: addDays(todayLocal(), 3) }));
    const exp = await execute("INSERT INTO announcements (unit_id, titulo, corpo, publicar_em, expira_em, criado_por) VALUES (?, 'Velho', 'x', '2020-01-01', '2020-02-01', ?)", [A, coordA]);
    expect((await listForUser(membroA)).map((a) => a.titulo)).not.toEqual(expect.arrayContaining(["Futuro"]));
    expect((await listForUser(membroA)).map((a) => a.titulo)).not.toContain("Velho");
    await expect(getComunicado(membroA, futuro)).rejects.toThrow(NotFoundError);
    await expect(getComunicado(membroA, exp.insertId)).rejects.toThrow(NotFoundError);
    const gerenciados = await listManaged(coordA);
    expect(gerenciados.find((a) => a.titulo === "Futuro")!.estado).toBe("agendado");
    expect(gerenciados.find((a) => a.titulo === "Velho")!.estado).toBe("expirado");
    expect(await listManaged(membroA)).toEqual([]);
  });
  it("valida expiração anterior à publicação", async () => {
    await expect(createComunicado(coordA, c({ publicarData: addDays(todayLocal(), 5), expiraData: addDays(todayLocal(), 2) }))).rejects.toThrow(DomainError);
  });
  it("confirmação de leitura é individual e idempotente; gestor vê quem não leu", async () => {
    const id = await createComunicado(coordA, c({ titulo: "Leitura" }));
    const antes = await unreadCount(membroA);
    await confirmRead(membroA, id); await confirmRead(membroA, id);
    expect(await unreadCount(membroA)).toBe(antes - 1);
    const s = await readStats(coordA, id);
    expect(s.lidos).toBe(1);
    expect(s.pendentes).not.toContain("Maria A");
    await expect(readStats(membroA, id)).rejects.toThrow(ForbiddenError); // integrante não vê quem leu
  });
  it("exclusão exige permissão e fica auditada", async () => {
    const id = await createComunicado(coordA, c({ titulo: "Apagar" }));
    await expect(deleteComunicado(membroA, id)).rejects.toThrow();
    await deleteComunicado(coordA, id);
    await expect(getComunicado(admin, id)).rejects.toThrow(NotFoundError);
  });
});
