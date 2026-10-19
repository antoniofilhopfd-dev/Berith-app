import { vi, describe, it, expect } from "vitest";
import { contarCaracteres, diffPalavras, normalizarHashtags, problemasDoConteudo, textoDaRede, TRANSICOES, STATUS, type DadosConteudo } from "@/lib/editorial";
import { datasNoPeriodo, pascoa } from "@/lib/datas";
import { dataHora, lerPublicacao } from "@/lib/validation/editorial";

const d = (o: Partial<DadosConteudo> = {}): DadosConteudo => ({
  titulo: "Título", formato: "post", legenda: "Olá", hashtags: "#a #b", redes: [{ rede: "instagram" }], midias: [{ id: 1, tipo: "imagem" }], ...o,
});

describe("hashtags e contagem", () => {
  it("normaliza, deduplica e ignora lixo", () => {
    expect(normalizarHashtags("fé, #Fé  #esperança; #fé $$ ####")).toEqual(["#fé", "#esperança"]);
    expect(normalizarHashtags(null)).toEqual([]);
  });
  it("conta caracteres Unicode (emoji = 1)", () => {
    expect(contarCaracteres("ação ✝️")).toBe(Array.from("ação ✝️").length);
    expect(contarCaracteres(null)).toBe(0);
  });
  it("monta o texto final com legenda própria ou herdada", () => {
    expect(textoDaRede({ legenda: "Base", hashtags: "#a" }, {})).toBe("Base\n\n#a");
    expect(textoDaRede({ legenda: "Base", hashtags: "#a" }, { legenda: "Própria", hashtags: "#z" })).toBe("Própria\n\n#z");
  });
});

describe("validação do conteúdo por formato e rede", () => {
  it("aceita post de imagem no Instagram", () => expect(problemasDoConteudo(d())).toEqual([]));
  it("exige título, rede e mídia", () => {
    const p = problemasDoConteudo(d({ titulo: " ", redes: [], midias: [] }));
    expect(p.join(" ")).toMatch(/título/); expect(p.join(" ")).toMatch(/rede social/);
  });
  it("carrossel precisa de 2 a 10 mídias; stories 1; reels 1 vídeo", () => {
    expect(problemasDoConteudo(d({ formato: "carrossel" })).join(" ")).toMatch(/2 a 10/);
    expect(problemasDoConteudo(d({ formato: "carrossel", midias: Array.from({ length: 11 }, (_, i) => ({ id: i, tipo: "imagem" as const })) })).join(" ")).toMatch(/2 a 10/);
    expect(problemasDoConteudo(d({ formato: "stories", midias: [{ id: 1, tipo: "imagem" }, { id: 2, tipo: "imagem" }] })).join(" ")).toMatch(/Stories/);
    expect(problemasDoConteudo(d({ formato: "reels", midias: [{ id: 1, tipo: "imagem" }] })).join(" ")).toMatch(/1 vídeo/);
    expect(problemasDoConteudo(d({ formato: "reels", midias: [{ id: 1, tipo: "video" }] }))).toEqual([]);
  });
  it("recusa formato que a rede não aceita", () => {
    expect(problemasDoConteudo(d({ formato: "video", redes: [{ rede: "instagram" }], midias: [{ id: 1, tipo: "video" }] })).join(" ")).toMatch(/Instagram não aceita/);
    expect(problemasDoConteudo(d({ formato: "post", redes: [{ rede: "youtube" }] })).join(" ")).toMatch(/YouTube não aceita/);
  });
  it("respeita limites de texto, hashtags e título do YouTube", () => {
    expect(problemasDoConteudo(d({ legenda: "x".repeat(2201) })).join(" ")).toMatch(/2200/);
    expect(problemasDoConteudo(d({ hashtags: Array.from({ length: 31 }, (_, i) => `#t${i}`).join(" ") })).join(" ")).toMatch(/30 hashtags/);
    const yt = d({ formato: "video", redes: [{ rede: "youtube", tituloExterno: "t".repeat(101) }], midias: [{ id: 1, tipo: "video" }] });
    expect(problemasDoConteudo(yt).join(" ")).toMatch(/100/);
  });
  it("Facebook aceita post só de texto; Instagram não", () => {
    expect(problemasDoConteudo(d({ redes: [{ rede: "facebook" }], midias: [] }))).toEqual([]);
    expect(problemasDoConteudo(d({ redes: [{ rede: "instagram" }], midias: [] })).join(" ")).toMatch(/imagem/);
  });
});

describe("fluxo de aprovação", () => {
  it("não há saída de publicado e todo status tem entrada definida", () => {
    expect(TRANSICOES.publicado).toEqual([]);
    for (const s of STATUS) expect(TRANSICOES[s]).toBeDefined();
    expect(TRANSICOES.rascunho).not.toContain("publicado");
    expect(TRANSICOES.em_revisao).not.toContain("agendado");
  });
});

describe("comparação de versões", () => {
  it("destaca o que foi removido e adicionado", () => {
    const r = diffPalavras("Venha rezar conosco hoje", "Venha rezar conosco amanhã às 19h");
    expect(r.filter((t) => t.tipo === "removido").map((t) => t.texto.trim()).join("")).toBe("hoje");
    expect(r.filter((t) => t.tipo === "adicionado").map((t) => t.texto.trim()).join(" ")).toContain("amanhã");
    expect(r.filter((t) => t.tipo === "igual").map((t) => t.texto).join("")).toContain("Venha rezar conosco");
  });
  it("textos iguais não têm diferenças", () => {
    expect(diffPalavras("igual", "igual").every((t) => t.tipo === "igual")).toBe(true);
  });
});

describe("datas comemorativas", () => {
  it("calcula a Páscoa corretamente", () => {
    expect(pascoa(2025)).toBe("2025-04-20"); expect(pascoa(2026)).toBe("2026-04-05"); expect(pascoa(2027)).toBe("2027-03-28");
  });
  it("deriva datas móveis e fixas", () => {
    const t = datasNoPeriodo("2026-01-01", "2026-12-31");
    const nomes = (n: string) => t.find((x) => x.nome === n)?.dia;
    expect(nomes("Quarta-feira de Cinzas")).toBe("2026-02-18"); expect(nomes("Pentecostes")).toBe("2026-05-24");
    expect(nomes("Nossa Senhora Aparecida")).toBe("2026-10-12"); expect(nomes("Dia das Mães")).toBe("2026-05-10");
    expect(nomes("1º Domingo do Advento")).toBe("2026-11-29"); expect(nomes("Cristo Rei do Universo")).toBe("2026-11-22");
  });
  it("inclui datas próprias, anuais ou únicas, só dentro do período", () => {
    const t = datasNoPeriodo("2026-03-01", "2027-03-31", [{ nome: "Aniversário da comunidade", dia: "2020-03-10", anual: true }, { nome: "Evento único", dia: "2026-03-15", anual: false }]);
    expect(t.filter((x) => x.nome === "Aniversário da comunidade").map((x) => x.dia)).toEqual(["2026-03-10", "2027-03-10"]);
    expect(t.filter((x) => x.nome === "Evento único")).toHaveLength(1);
  });
});

describe("formulário da produção", () => {
  it("converte data/hora do fuso do ministério para UTC", () => {
    expect(dataHora("2026-10-20", "19:00", "Publicação")?.toISOString()).toBe("2026-10-20T22:00:00.000Z");
    expect(dataHora("", "", "x")).toBeNull();
    expect(() => dataHora("2026-02-30", "10:00", "Prazo")).toThrow();
    expect(() => dataHora("2026-10-20", "25:00", "Prazo")).toThrow();
  });
  it("lê campos planos, redes e mídias", () => {
    const f = new FormData();
    f.set("titulo", "Convite"); f.set("formato", "carrossel"); f.append("redes", "instagram"); f.append("redes", "facebook"); f.append("redes", "instagram");
    f.set("midiaIds", "3, 4,5"); f.set("legenda_facebook", "Texto do FB"); f.set("publicarData", "2026-11-01"); f.set("publicarHora", "08:30");
    const r = lerPublicacao(f);
    expect(r.dados.redes).toEqual(["instagram", "facebook"]); expect(r.dados.midiaIds).toEqual([3, 4, 5]);
    expect(r.dados.redesExtra.facebook?.legenda).toBe("Texto do FB"); expect(r.publicarEm?.toISOString()).toBe("2026-11-01T11:30:00.000Z");
  });
  it("recusa título curto e formato inválido", () => {
    const f = new FormData(); f.set("titulo", "a"); f.set("formato", "post");
    expect(() => lerPublicacao(f)).toThrow();
    const g = new FormData(); g.set("titulo", "ok título"); g.set("formato", "gif");
    expect(() => lerPublicacao(g)).toThrow();
  });
});

describe("redes habilitadas", () => {
  it("por padrão o produto usa só o Instagram (telas e formatos)", async () => {
    const antes = process.env.REDES_ATIVAS;
    delete process.env.REDES_ATIVAS;
    vi.resetModules();
    try {
      const m = await import("@/lib/editorial");
      expect(m.REDES_ATIVAS).toEqual(["instagram"]);
      expect(m.FORMATOS_ATIVOS).toEqual(["post", "carrossel", "stories", "reels"]); // sem vídeo longo/shorts (não existem no Instagram)
      expect(m.REDES).toContain("facebook"); // dados antigos continuam legíveis
    } finally { if (antes !== undefined) process.env.REDES_ATIVAS = antes; vi.resetModules(); }
  });
});
