import { describe, it, expect } from "vitest";
import { advento, batismoDoSenhor, ciclos, diaLiturgico, pascoa } from "@/lib/liturgia/calendario";

describe("calendário litúrgico (datas de referência conhecidas)", () => {
  it("calcula a Páscoa", () => {
    expect(pascoa(2024)).toBe("2024-03-31");
    expect(pascoa(2025)).toBe("2025-04-20");
    expect(pascoa(2026)).toBe("2026-04-05");
    expect(pascoa(2027)).toBe("2027-03-28");
    expect(pascoa(2038)).toBe("2038-04-25");
  });
  it("calcula o primeiro domingo do Advento", () => {
    expect(advento(2024)).toBe("2024-12-01");
    expect(advento(2025)).toBe("2025-11-30");
    expect(advento(2026)).toBe("2026-11-29");
    expect(advento(2022)).toBe("2022-11-27");
  });
  it("Batismo do Senhor (Epifania em domingo, como no Brasil)", () => {
    expect(batismoDoSenhor(2026)).toBe("2026-01-11"); // Epifania 4/1
    expect(batismoDoSenhor(2025)).toBe("2025-01-12"); // Epifania 5/1
    expect(batismoDoSenhor(2024)).toBe("2024-01-08"); // Epifania 7/1 → Batismo na segunda-feira
  });
  it("ciclos dominical (A/B/C) e ferial (I/II)", () => {
    expect(ciclos("2024-12-01").dominical).toBe("C");
    expect(ciclos("2025-11-30").dominical).toBe("A");
    expect(ciclos("2026-10-09").dominical).toBe("A");
    expect(ciclos("2026-11-29").dominical).toBe("B");
    expect(ciclos("2025-03-10").ferial).toBe("I");
    expect(ciclos("2026-10-09").ferial).toBe("II");
    expect(ciclos("2025-12-10").ferial).toBe("II"); // já no ano litúrgico 2025-26
  });
  it("tempos e títulos", () => {
    expect(diaLiturgico("2026-02-18")).toMatchObject({ tempo: "quaresma", titulo: "Quarta-feira de Cinzas", cor: "roxo" });
    expect(diaLiturgico("2026-02-22")).toMatchObject({ tempo: "quaresma", semana: 1, cor: "roxo", titulo: "1º Domingo da Quaresma" });
    expect(diaLiturgico("2026-03-29")).toMatchObject({ tempoNome: "Semana Santa", cor: "vermelho" });
    expect(diaLiturgico("2026-04-03")).toMatchObject({ tempo: "triduo", titulo: "Sexta-feira da Paixão do Senhor", cor: "vermelho" });
    expect(diaLiturgico("2026-04-05")).toMatchObject({ tempo: "pascal", cor: "branco" });
    expect(diaLiturgico("2026-05-24")).toMatchObject({ tempo: "pascal", titulo: "Domingo de Pentecostes", cor: "vermelho" });
    expect(diaLiturgico("2026-05-25")).toMatchObject({ tempo: "comum", cor: "verde" });
    expect(diaLiturgico("2025-12-25")).toMatchObject({ tempo: "natal", titulo: "Natal do Senhor", cor: "branco" });
    expect(diaLiturgico("2026-12-24")).toMatchObject({ tempo: "advento", cor: "roxo", semana: 4 });
  });
  it("Tempo Comum: numeração das semanas fecha na 34ª, antes e depois da Quaresma", () => {
    expect(diaLiturgico("2026-10-04")).toMatchObject({ tempo: "comum", semana: 27, domingo: true });
    expect(diaLiturgico("2026-10-09")).toMatchObject({ tempo: "comum", semana: 27, titulo: "Sexta-feira da 27ª semana do Tempo Comum" });
    expect(diaLiturgico("2026-11-22")).toMatchObject({ semana: 34, domingo: true });
    expect(diaLiturgico("2026-11-28")).toMatchObject({ semana: 34 });
    expect(diaLiturgico("2026-01-12")).toMatchObject({ tempo: "comum", semana: 1 }); // segunda após o Batismo
    expect(diaLiturgico("2026-01-18")).toMatchObject({ semana: 2, domingo: true });
    expect(diaLiturgico("2026-02-17")).toMatchObject({ tempo: "comum", semana: 6 }); // terça antes das Cinzas
  });
  it("todo dia de 3 anos tem tempo definido e nenhum buraco entre os tempos", () => {
    const d = new Date("2025-01-01T12:00:00Z");
    for (let i = 0; i < 365 * 3; i++) {
      const s = new Date(d.getTime() + i * 86400_000).toISOString().slice(0, 10);
      const r = diaLiturgico(s);
      expect(r.titulo.length).toBeGreaterThan(3);
      if (r.tempo === "comum") expect(r.semana).toBeGreaterThanOrEqual(1);
      if (r.tempo === "comum") expect(r.semana).toBeLessThanOrEqual(34);
    }
  });
});
