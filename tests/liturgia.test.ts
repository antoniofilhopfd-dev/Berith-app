import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { closePool, query } from "@/lib/db";
import { ForbiddenError } from "@/lib/permissions";
import { adicionarFonte, excluirItem, itensDoDia, listarFontes, removerFonte, salvarItem } from "@/lib/services/liturgia";
import { fonteSchema, itemLiturgiaSchema } from "@/lib/validation/liturgia";
import { resetTestDb, criarUsuario, criarUnidade, darPapel, vincular } from "./helpers";

let admin = 0, com = 0, coord = 0, membro = 0;
const item = (o: Record<string, unknown> = {}) => itemLiturgiaSchema.parse({ data: "2026-10-09", tipo: "evangelho", titulo: "Referência de teste", fonteNome: "Fonte de teste", ...o });

beforeAll(async () => {
  await resetTestDb();
  admin = await criarUsuario("a@t.com"); com = await criarUsuario("c@t.com"); coord = await criarUsuario("co@t.com"); membro = await criarUsuario("m@t.com");
  await darPapel(admin, "admin_geral"); await darPapel(com, "resp_comunicacao");
  const u = await criarUnidade("ministerio", "Música"); await darPapel(coord, "coord_ministerio", u); await vincular(membro, u);
});
afterAll(closePool);

describe("validação: fonte obrigatória e links seguros", () => {
  it("exige a fonte (direitos autorais)", () => {
    expect(() => item({ fonteNome: "" })).toThrow(/fonte/i);
    expect(() => item({ fonteNome: undefined })).toThrow();
  });
  it("aceita apenas links http(s)", () => {
    expect(item({ fonteUrl: "https://exemplo.org/liturgia" }).fonteUrl).toBe("https://exemplo.org/liturgia");
    for (const u of ["javascript:alert(1)", "data:text/html,<script>", "ftp://x.org", "//x.org", "não é link"]) expect(() => item({ fonteUrl: u })).toThrow();
    expect(() => fonteSchema.parse({ titulo: "X", url: "javascript:alert(1)" })).toThrow();
  });
  it("rejeita data inválida e tipo inexistente", () => {
    expect(() => item({ data: "2026-02-30" })).toThrow();
    expect(() => item({ tipo: "inventado" })).toThrow();
  });
});

describe("cadastro de liturgia", () => {
  it("somente papéis com permissão de conteúdos cadastram (administração e comunicação)", async () => {
    await expect(salvarItem(membro, item())).rejects.toThrow(ForbiddenError);
    await expect(salvarItem(coord, item())).rejects.toThrow(ForbiddenError);
    await salvarItem(com, item({ titulo: "Primeira versão" }));
    expect((await itensDoDia("2026-10-09"))[0].titulo).toBe("Primeira versão");
  });
  it("salvar de novo atualiza o mesmo dia/tipo (sem duplicar) e guarda a fonte", async () => {
    await salvarItem(admin, item({ titulo: "Segunda versão", fonteUrl: "https://exemplo.org", direitos: "Uso autorizado" }));
    const r = await itensDoDia("2026-10-09");
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ titulo: "Segunda versão", fonte_nome: "Fonte de teste", fonte_url: "https://exemplo.org", direitos: "Uso autorizado" });
  });
  it("dias e tipos diferentes convivem; consulta por dia não vaza outros dias", async () => {
    await salvarItem(com, item({ tipo: "santo", titulo: "Santo de teste" }));
    await salvarItem(com, item({ data: "2026-10-10", titulo: "Outro dia" }));
    expect((await itensDoDia("2026-10-09")).map((i) => i.tipo).sort()).toEqual(["evangelho", "santo"]);
    expect((await itensDoDia("2026-10-10")).map((i) => i.titulo)).toEqual(["Outro dia"]);
  });
  it("texto é guardado como texto (sem execução) e a exclusão exige permissão", async () => {
    await salvarItem(com, item({ tipo: "laudes", titulo: "<script>alert(1)</script>", texto: "<img src=x onerror=alert(1)>" }));
    const l = (await itensDoDia("2026-10-09")).find((i) => i.tipo === "laudes")!;
    expect(l.titulo).toBe("<script>alert(1)</script>");
    await expect(excluirItem(membro, l.id)).rejects.toThrow(ForbiddenError);
    await excluirItem(com, l.id);
    expect((await itensDoDia("2026-10-09")).some((i) => i.tipo === "laudes")).toBe(false);
  });
  it("auditoria registra quem cadastrou e a fonte", async () => {
    const a = await query<any>("SELECT acao, detalhes FROM audit_log WHERE acao LIKE 'liturgia.%' ORDER BY id");
    expect(a.length).toBeGreaterThan(3);
    expect(a[0].detalhes).toContain("Fonte de teste");
  });
});

describe("fontes oficiais", () => {
  it("só quem edita gerencia os atalhos; limite de 20", async () => {
    await expect(adicionarFonte(membro, { titulo: "X", url: "https://x.org" })).rejects.toThrow(ForbiddenError);
    await adicionarFonte(com, { titulo: "Fonte 1", url: "https://exemplo.org/a" });
    const f = await listarFontes();
    expect(f.map((x) => x.titulo)).toEqual(["Fonte 1"]);
    await expect(removerFonte(membro, f[0].id)).rejects.toThrow(ForbiddenError);
    await removerFonte(com, f[0].id);
    expect(await listarFontes()).toEqual([]);
    for (let i = 0; i < 20; i++) await adicionarFonte(com, { titulo: `F${i}`, url: `https://exemplo.org/${i}` });
    await expect(adicionarFonte(com, { titulo: "21", url: "https://exemplo.org/21" })).rejects.toThrow(/Limite/);
  });
});
