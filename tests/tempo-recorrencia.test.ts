import { describe, it, expect } from "vitest";
import { addDays, addMonths, isDate, isTime, localToUtc, utcToLocal } from "@/lib/time";
import { occurrences, isOccurrence } from "@/lib/services/recorrencia";

describe("fuso horário da comunidade", () => {
  it("converte hora local de São Paulo para UTC e de volta", () => {
    const d = localToUtc("2026-10-09", "19:30");
    expect(d.toISOString()).toBe("2026-10-09T22:30:00.000Z"); // UTC-3
    expect(utcToLocal(d)).toMatchObject({ date: "2026-10-09", time: "19:30" });
  });
  it("evento às 23h local fica no dia certo (virada de dia em UTC)", () => {
    const d = localToUtc("2026-10-09", "23:30");
    expect(d.toISOString()).toBe("2026-10-10T02:30:00.000Z");
    expect(utcToLocal(d).date).toBe("2026-10-09");
  });
  it("respeita horário de verão de outros fusos (teste do conversor)", () => {
    expect(localToUtc("2026-07-01", "12:00", "America/New_York").toISOString()).toBe("2026-07-01T16:00:00.000Z");
    expect(localToUtc("2026-01-01", "12:00", "America/New_York").toISOString()).toBe("2026-01-01T17:00:00.000Z");
  });
  it("valida data e hora", () => {
    expect(isDate("2026-02-30")).toBe(false); expect(isDate("2026-02-28")).toBe(true);
    expect(isDate("28/02/2026")).toBe(false); expect(isTime("24:00")).toBe(false); expect(isTime("19:30")).toBe(true);
  });
  it("soma dias e meses sem estourar o calendário", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addMonths("2026-01-31", 1)).toEqual({ date: "2026-02-28", ok: false });
    expect(addMonths("2026-01-15", 12)).toEqual({ date: "2027-01-15", ok: true });
  });
});

describe("recorrência", () => {
  const ev = (o: object) => ({ inicio: localToUtc("2026-10-04", "19:00"), fim: localToUtc("2026-10-04", "21:00"), recorrencia: "nenhuma" as const, recorrencia_ate: null, ...o });
  const dia = (d: string, h = "00:00") => localToUtc(d, h);
  it("evento simples aparece só no período", () => {
    expect(occurrences(ev({}), dia("2026-10-01"), dia("2026-10-31"))).toHaveLength(1);
    expect(occurrences(ev({}), dia("2026-11-01"), dia("2026-11-30"))).toHaveLength(0);
  });
  it("semanal respeita o fim da série e mantém a hora local", () => {
    const e = ev({ recorrencia: "semanal", recorrencia_ate: "2026-11-01" });
    const o = occurrences(e, dia("2026-10-01"), dia("2026-12-31"));
    expect(o.map((x) => x.date)).toEqual(["2026-10-04", "2026-10-11", "2026-10-18", "2026-10-25", "2026-11-01"]);
    expect(o.every((x) => utcToLocal(x.inicio).time === "19:00")).toBe(true);
    expect(o[1].fim!.getTime() - o[1].inicio.getTime()).toBe(2 * 3600_000);
  });
  it("mensal pula meses sem o dia 31", () => {
    const e = ev({ inicio: localToUtc("2026-01-31", "10:00"), fim: null, recorrencia: "mensal", recorrencia_ate: "2026-06-30" });
    expect(occurrences(e, dia("2026-01-01"), dia("2026-12-31")).map((x) => x.date)).toEqual(["2026-01-31", "2026-03-31", "2026-05-31"]);
  });
  it("isOccurrence diferencia datas válidas de inválidas", () => {
    const e = ev({ recorrencia: "semanal", recorrencia_ate: "2026-12-31" });
    expect(isOccurrence(e, "2026-10-11")).toBe(true);
    expect(isOccurrence(e, "2026-10-12")).toBe(false);
    expect(isOccurrence(e, "2027-01-03")).toBe(false);
  });
  it("evento que cruza a meia-noite aparece no período que toca", () => {
    const e = ev({ inicio: localToUtc("2026-10-04", "22:00"), fim: localToUtc("2026-10-05", "02:00") });
    expect(occurrences(e, dia("2026-10-05"), dia("2026-10-06"))).toHaveLength(1);
  });
});
