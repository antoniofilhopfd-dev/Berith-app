import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";

// Simula chamadas diretas às Server Actions (POST manual) sem cookie de sessão.
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }),
  headers: async () => new Headers({ host: "localhost" }),
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

import { criarEstruturaAction, adicionarIntegranteAction, atribuirPapelAction, encerrarVinculoAction } from "@/app/(app)/estruturas/actions";
import { aprovarAction, convidarAction, situacaoAction, gerarLinkSenhaAction } from "@/app/(app)/membros/actions";
import { closePool, query } from "@/lib/db";
import { resetTestDb } from "./helpers";

const form = (o: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.set(k, v); return f; };

beforeAll(resetTestDb);
afterAll(closePool);

describe("Server Actions chamadas sem sessão", () => {
  const casos: [string, (f: FormData) => Promise<{ erro?: string }>, Record<string, string>][] = [
    ["criarEstrutura", (f) => criarEstruturaAction({}, f), { tipo: "caminho", nome: "Invasor" }],
    ["adicionarIntegrante", (f) => adicionarIntegranteAction({}, f), { unitId: "1", email: "a@b.com" }],
    ["atribuirPapel", (f) => atribuirPapelAction({}, f), { userId: "1", codigo: "admin_geral" }],
    ["encerrarVinculo", (f) => encerrarVinculoAction({}, f), { membershipId: "1" }],
    ["convidar", (f) => convidarAction({}, f), { nome: "X Y", email: "x@y.com" }],
    ["aprovar", (f) => aprovarAction({}, f), { userId: "1" }],
    ["situacao", (f) => situacaoAction({}, f), { userId: "1", status: "suspenso" }],
    ["gerarLinkSenha", (f) => gerarLinkSenhaAction({}, f), { userId: "1" }],
  ];
  for (const [nome, fn, dados] of casos) {
    it(`${nome} recusa sem sessão e não altera o banco`, async () => {
      const r = await fn(form(dados));
      expect(r.erro).toMatch(/Sessão expirada/);
    });
  }
  it("nenhuma estrutura foi criada", async () => {
    expect(await query<any>("SELECT id FROM org_units")).toEqual([]);
  });
});
