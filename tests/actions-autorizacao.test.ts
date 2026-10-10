import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { createHash } from "node:crypto";

// Cada chamada é feita como um usuário REAL e autenticado (cookie de sessão válido) — mas sem permissão para a ação.
let tokenAtual: string | null = null;
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (n: string) => (tokenAtual && n.includes("nb_session") ? { value: tokenAtual } : undefined), set: () => {}, delete: () => {} }),
  headers: async () => new Headers({ host: "localhost" }),
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/navigation", async (orig) => ({ ...(await orig<typeof import("next/navigation")>()), redirect: (u: string) => { throw Object.assign(new Error("NEXT_REDIRECT"), { digest: `NEXT_REDIRECT;replace;${u};307;` }); } }));

import { closePool, execute, query } from "@/lib/db";
import { criarEstruturaAction, atribuirPapelAction, adicionarIntegranteAction } from "@/app/(app)/estruturas/actions";
import { criarEventoAction, cancelarEventoAction } from "@/app/(app)/eventos/actions";
import { publicarComunicadoAction, excluirComunicadoAction } from "@/app/(app)/comunicados/actions";
import { criarLancamentoAction, aprovarAction, estornarAction, fecharPeriodoAction } from "@/app/(app)/financeiro/actions";
import { salvarLiturgiaAction } from "@/app/(app)/liturgia/actions";
import { criarConteudoAction } from "@/app/(app)/formacao/actions";
import { criarAlbumAction, excluirAlbumAction } from "@/app/(app)/midia/actions";
import { criarTarefaAction } from "@/app/(app)/tarefas/actions";
import { escalarAction } from "@/app/(app)/escalas/actions";
import { situacaoAction, aprovarAction as aprovarMembroAction } from "@/app/(app)/membros/actions";
import { marcarPresencaAction } from "@/app/(app)/eventos/presencas-actions";
import { excluirArquivoAction } from "@/app/(app)/arquivos-actions";
import { comunicadoSchema, eventoSchema } from "@/lib/validation/eventos";
import { createComunicado } from "@/lib/services/comunicados";
import { createEvent } from "@/lib/services/eventos";
import { addDays, todayLocal } from "@/lib/time";
import { resetTestDb, criarUsuario, criarUnidade, darPapel, vincular } from "./helpers";

const form = (o: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.set(k, v); return f; };
const tokens = new Map<number, string>();
let admin = 0, coordA = 0, membro = 0, comunicacao = 0, A = 0, B = 0, evB = 0, comB = 0;

beforeAll(async () => {
  await resetTestDb();
  admin = await criarUsuario("a@t.com"); coordA = await criarUsuario("ca@t.com"); membro = await criarUsuario("m@t.com"); comunicacao = await criarUsuario("c@t.com");
  await darPapel(admin, "admin_geral"); await darPapel(comunicacao, "resp_comunicacao");
  A = await criarUnidade("ministerio", "A"); B = await criarUnidade("ministerio", "B");
  await darPapel(coordA, "coord_ministerio", A); await vincular(membro, A);
  evB = await createEvent(admin, eventoSchema.parse({ titulo: "Evento do B", data: addDays(todayLocal(), 2), horaInicio: "19:00", unitId: String(B) }));
  comB = await createComunicado(admin, comunicadoSchema.parse({ titulo: "Aviso do B", corpo: "Só do B", unitId: String(B) }));
  for (const u of [admin, coordA, membro, comunicacao]) { const t = `tok-${u}-${Math.random().toString(36).slice(2)}`; tokens.set(u, t); await execute("INSERT INTO sessions (user_id, token_hash, expira_em) VALUES (?, ?, DATE_ADD(UTC_TIMESTAMP(), INTERVAL 1 DAY))", [u, createHash("sha256").update(t).digest("hex")]); }
});
afterAll(closePool);
const como = (u: number) => { tokenAtual = tokens.get(u)!; };
const NEGADO = /permissão|Você não tem/;
const contar = async (t: string) => Number((await query<any>(`SELECT COUNT(*) n FROM ${t}`))[0].n);

describe("Server Actions chamadas diretamente por usuário autenticado SEM permissão", () => {
  it("integrante comum não cria estrutura, não atribui papéis, não vincula pessoas", async () => {
    como(membro); const antes = await contar("org_units");
    expect((await criarEstruturaAction({}, form({ tipo: "grupo", nome: "Invasão", parentId: String(A) }))).erro).toMatch(NEGADO);
    expect((await atribuirPapelAction({}, form({ userId: String(membro), codigo: "admin_geral" }))).erro).toMatch(NEGADO);
    expect((await adicionarIntegranteAction({}, form({ unitId: String(A), email: "c@t.com" }))).erro).toMatch(NEGADO);
    expect(await contar("org_units")).toBe(antes);
    expect(Number((await query<any>("SELECT COUNT(*) n FROM user_roles WHERE user_id = ?", [membro]))[0].n)).toBe(0);
  });
  it("coordenação de A não age sobre a estrutura B (eventos, comunicados, álbuns, escalas, tarefas, presença)", async () => {
    como(coordA);
    expect((await criarEventoAction({}, form({ titulo: "Invasão", data: addDays(todayLocal(), 3), horaInicio: "10:00", unitId: String(B) }))).erro).toMatch(NEGADO);
    expect((await cancelarEventoAction({}, form({ id: String(evB), motivo: "x" }))).erro).toMatch(NEGADO);
    expect((await publicarComunicadoAction({}, form({ titulo: "Falso aviso", corpo: "texto falso", unitId: String(B) }))).erro).toMatch(NEGADO);
    expect((await excluirComunicadoAction({}, form({ id: String(comB) }))).erro).toMatch(NEGADO);
    expect((await criarAlbumAction({}, form({ titulo: "Álbum invasor", unitId: String(B) }))).erro).toMatch(NEGADO);
    expect((await criarTarefaAction({}, form({ unitId: String(B), titulo: "Tarefa invasora" }))).erro).toMatch(NEGADO);
    expect((await escalarAction({}, form({ shiftId: "1", email: "m@t.com" }))).erro).toMatch(NEGADO);
    expect((await marcarPresencaAction({}, form({ eventId: String(evB), date: addDays(todayLocal(), 2), userId: String(membro), presente: "1" }))).erro).toMatch(NEGADO);
    expect(await contar("tasks")).toBe(0); expect(await contar("albums")).toBe(0); expect(Number((await query<any>("SELECT cancelado_em FROM events WHERE id = ?", [evB]))[0].cancelado_em ? 1 : 0)).toBe(0);
    expect(Number((await query<any>("SELECT COUNT(*) n FROM announcements WHERE id = ?", [comB]))[0].n)).toBe(1);
  });
  it("ninguém além do financeiro mexe no financeiro (coordenação, integrante e comunicação)", async () => {
    const [cta] = await query<any>("SELECT id FROM fin_contas LIMIT 1"); const [cat] = await query<any>("SELECT id FROM fin_categorias WHERE tipo = 'entrada' LIMIT 1");
    const dados = { contaId: String(cta.id), categoriaId: String(cat.id), tipo: "entrada", valor: "10,00", data: todayLocal(), descricao: "Tentativa indevida" };
    for (const u of [coordA, membro, comunicacao]) {
      como(u);
      expect((await criarLancamentoAction({}, form(dados))).erro, `criar ${u}`).toMatch(NEGADO);
      expect((await aprovarAction({}, form({ id: "1" }))).erro).toMatch(NEGADO);
      expect((await estornarAction({}, form({ id: "1", motivo: "teste" }))).erro).toMatch(NEGADO);
      expect((await fecharPeriodoAction({}, form({ periodo: "2020-01" }))).erro).toMatch(NEGADO);
    }
    expect(await contar("fin_lancamentos")).toBe(0);
  });
  it("conteúdo litúrgico e formação global só para administração/comunicação", async () => {
    como(coordA);
    expect((await salvarLiturgiaAction({}, form({ data: todayLocal(), tipo: "evangelho", titulo: "Falso", fonteNome: "x1" }))).erro).toMatch(NEGADO);
    expect((await criarConteudoAction({}, form({ categoria: "oracao", titulo: "Conteúdo falso", fonteNome: "Fonte", unitId: "" }))).erro).toMatch(NEGADO);
    expect(await contar("liturgia_itens")).toBe(0);
  });
  it("só a administração suspende pessoas; coordenação sem escopo não aprova membros", async () => {
    como(coordA);
    expect((await situacaoAction({}, form({ userId: String(membro), status: "suspenso" }))).erro).toMatch(NEGADO);
    expect((await aprovarMembroAction({}, form({ userId: String(membro) }))).erro).toMatch(NEGADO);
    expect((await query<any>("SELECT status FROM users WHERE id = ?", [membro]))[0].status).toBe("ativo");
  });
  it("excluir arquivo e álbum alheios é negado", async () => {
    como(admin);
    await expect(criarAlbumAction({}, form({ titulo: "Álbum do B", unitId: String(B) }))).rejects.toThrow(/NEXT_REDIRECT/);
    const [alb] = await query<any>("SELECT id FROM albums LIMIT 1");
    como(coordA);
    expect((await excluirAlbumAction({}, form({ id: String(alb.id) }))).erro).toMatch(NEGADO);
    expect((await excluirArquivoAction({}, form({ id: "999" }))).erro).toMatch(NEGADO);
    expect(await contar("albums")).toBe(1);
  });
  it("com a permissão correta, a mesma chamada funciona (o bloqueio é por regra, não por falha)", async () => {
    como(coordA);
    const r = await criarTarefaAction({}, form({ unitId: String(A), titulo: "Tarefa legítima" })).catch((e) => e);
    expect(String((r as Error).message ?? "")).toMatch(/NEXT_REDIRECT/);
    como(comunicacao);
    expect((await salvarLiturgiaAction({}, form({ data: todayLocal(), tipo: "evangelho", titulo: "Legítimo", fonteNome: "Fonte de teste" }))).ok).toBeTruthy();
  });
  it("sessão revogada: a ação deixa de funcionar imediatamente", async () => {
    como(coordA); await execute("UPDATE sessions SET revogada_em = UTC_TIMESTAMP() WHERE user_id = ?", [coordA]);
    expect((await criarTarefaAction({}, form({ unitId: String(A), titulo: "Depois de sair" }))).erro).toMatch(/Sessão expirada/);
  });
});
