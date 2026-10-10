import type { RowDataPacket } from "mysql2/promise";
import { execute, query, tx } from "@/lib/db";
import { assertCan, can } from "@/lib/permissions";
import { todayLocal, addDays } from "@/lib/time";
import { csv } from "@/lib/csv";
import type { z } from "zod";
import type { lancamentoSchema } from "@/lib/validation/financeiro";
import { DomainError, NotFoundError } from "./errors";
import { audit } from "./audit";
import { aprovadoresFinanceiros, notificar, notificarSeguro } from "./notificacoes";

export const PAGE = 25;
export type Lancamento = {
  id: number; conta_id: number; conta_nome: string; categoria_id: number; categoria_nome: string; tipo: "entrada" | "saida"; valor_centavos: number;
  data: string; descricao: string; doador_user_id: number | null; doador_nome: string | null; status: "pendente" | "aprovado" | "rejeitado";
  doador_membro: string | null; estorno_de: number | null; estornado_por: number | null; motivo: string | null; criado_por: number; criador: string; aprovador: string | null; aprovado_em: Date | null; conciliado: number;
};

const SEL = `SELECT l.*, c.nome AS conta_nome, k.nome AS categoria_nome, u.nome AS criador, a.nome AS aprovador, dm.nome AS doador_membro,
    (SELECT e.id FROM fin_lancamentos e WHERE e.estorno_de = l.id) AS estornado_por
  FROM fin_lancamentos l JOIN fin_contas c ON c.id = l.conta_id JOIN fin_categorias k ON k.id = l.categoria_id
  JOIN users u ON u.id = l.criado_por LEFT JOIN users a ON a.id = l.aprovado_por LEFT JOIN users dm ON dm.id = l.doador_user_id`;

export const podeVerDoadores = (actor: number) => can(actor, "contribuicoes", "ver", null);
/** Quem não tem autorização específica nunca recebe o doador (nem no objeto devolvido). */
const mascarar = (l: Lancamento, ver: boolean): Lancamento => (ver ? l : { ...l, doador_user_id: null, doador_nome: null, doador_membro: null });

async function aprovacaoDupla() {
  const r = await query<RowDataPacket>("SELECT valor FROM settings WHERE chave = 'financeiro_aprovacao_dupla'");
  return r[0]?.valor !== "0";
}
async function periodoFechado(data: string) {
  return (await query<RowDataPacket>("SELECT 1 x FROM fin_periodos WHERE periodo = ?", [data.slice(0, 7)])).length > 0;
}

export async function contasECategorias() {
  const [contas, categorias] = await Promise.all([
    query<RowDataPacket & { id: number; nome: string; ativa: number }>("SELECT id, nome, ativa FROM fin_contas ORDER BY nome"),
    query<RowDataPacket & { id: number; nome: string; tipo: "entrada" | "saida"; ativa: number }>("SELECT id, nome, tipo, ativa FROM fin_categorias ORDER BY tipo, nome"),
  ]);
  return { contas, categorias };
}

export async function criarLancamento(actor: number, d: z.infer<typeof lancamentoSchema>) {
  await assertCan(actor, "financeiro", "criar", null);
  if (d.data > todayLocal()) throw new DomainError("A data não pode ser futura.");
  if (await periodoFechado(d.data)) throw new DomainError("O período desta data está fechado.");
  const [conta] = await query<RowDataPacket>("SELECT ativa FROM fin_contas WHERE id = ?", [d.contaId]);
  const [cat] = await query<RowDataPacket>("SELECT ativa, tipo FROM fin_categorias WHERE id = ?", [d.categoriaId]);
  if (!conta?.ativa) throw new DomainError("Conta inválida.");
  if (!cat?.ativa || cat.tipo !== d.tipo) throw new DomainError("A categoria não corresponde ao tipo do lançamento.");
  let doador: number | null = null;
  if (d.doadorEmail || d.doadorNome) {
    if (d.tipo !== "entrada") throw new DomainError("Somente entradas têm doador.");
    if (d.doadorEmail) {
      const u = await query<RowDataPacket>("SELECT id FROM users WHERE email = ?", [d.doadorEmail]);
      if (!u[0]) throw new DomainError("Doador não encontrado pelo e-mail.");
      doador = u[0].id as number;
    }
  }
  const r = await execute(
    `INSERT INTO fin_lancamentos (conta_id, categoria_id, tipo, valor_centavos, data, descricao, doador_user_id, doador_nome, criado_por) VALUES (?,?,?,?,?,?,?,?,?)`,
    [d.contaId, d.categoriaId, d.tipo, d.valor, d.data, d.descricao, doador, doador ? null : d.doadorNome, actor]);
  await audit(actor, "financeiro.criar", { entidade: "lancamento", entidadeId: r.insertId, detalhes: { tipo: d.tipo, valor_centavos: d.valor } });
  // Aviso genérico (sem valores nem nomes) só para quem pode aprovar.
  await notificarSeguro(async () => notificar(await aprovadoresFinanceiros(actor), { tipo: "financeiro", titulo: "Lançamento aguardando aprovação", url: `/financeiro/${r.insertId}`, dedupeKey: `financeiro:${r.insertId}` }));
  return r.insertId;
}

export async function getLancamento(actor: number, id: number): Promise<Lancamento> {
  await assertCan(actor, "financeiro", "ver", null);
  const r = await query<Lancamento & RowDataPacket>(`${SEL} WHERE l.id = ?`, [id]);
  if (!r[0]) throw new NotFoundError();
  return mascarar(r[0], await podeVerDoadores(actor));
}

/** Edição somente enquanto pendente ou rejeitado (volta a pendente). Aprovado é imutável: use estorno. */
export async function editarLancamento(actor: number, id: number, d: z.infer<typeof lancamentoSchema>) {
  const l = await getLancamento(actor, id);
  await assertCan(actor, "financeiro", "editar", null);
  if (l.status === "aprovado") throw new DomainError("Lançamento aprovado não pode ser editado. Faça um estorno.");
  if (d.data > todayLocal()) throw new DomainError("A data não pode ser futura.");
  if (await periodoFechado(d.data)) throw new DomainError("O período desta data está fechado.");
  const [cat] = await query<RowDataPacket>("SELECT ativa, tipo FROM fin_categorias WHERE id = ?", [d.categoriaId]);
  if (!cat?.ativa || cat.tipo !== d.tipo) throw new DomainError("A categoria não corresponde ao tipo do lançamento.");
  await execute("UPDATE fin_lancamentos SET conta_id=?, categoria_id=?, tipo=?, valor_centavos=?, data=?, descricao=?, status='pendente', motivo=NULL WHERE id=? AND status <> 'aprovado'",
    [d.contaId, d.categoriaId, d.tipo, d.valor, d.data, d.descricao, id]);
  await audit(actor, "financeiro.editar", { entidade: "lancamento", entidadeId: id, detalhes: { valor_centavos: d.valor } });
}

export async function aprovar(actor: number, id: number) {
  const l = await getLancamento(actor, id);
  await assertCan(actor, "financeiro", "aprovar", null);
  if (l.status !== "pendente") throw new DomainError("Este lançamento não está pendente.");
  if ((await aprovacaoDupla()) && l.criado_por === actor) throw new DomainError("Outra pessoa precisa aprovar este lançamento (quem lançou não aprova).");
  if (await periodoFechado(String(l.data))) throw new DomainError("O período deste lançamento está fechado.");
  const r = await execute("UPDATE fin_lancamentos SET status='aprovado', aprovado_por=?, aprovado_em=UTC_TIMESTAMP(), motivo=NULL WHERE id=? AND status='pendente'", [actor, id]);
  if (r.affectedRows !== 1) throw new DomainError("Este lançamento já foi decidido.");
  await audit(actor, "financeiro.aprovar", { entidade: "lancamento", entidadeId: id });
}

export async function rejeitar(actor: number, id: number, motivo: string) {
  const l = await getLancamento(actor, id);
  await assertCan(actor, "financeiro", "aprovar", null);
  if (l.status !== "pendente") throw new DomainError("Este lançamento não está pendente.");
  await execute("UPDATE fin_lancamentos SET status='rejeitado', motivo=? WHERE id=? AND status='pendente'", [motivo, id]);
  await audit(actor, "financeiro.rejeitar", { entidade: "lancamento", entidadeId: id, detalhes: { motivo } });
}

/** Estorno = novo lançamento aprovado, de sentido oposto, na data de hoje. O original permanece intacto. */
export async function estornar(actor: number, id: number, motivo: string) {
  const l = await getLancamento(actor, id);
  await assertCan(actor, "financeiro", "aprovar", null);
  if (l.status !== "aprovado") throw new DomainError("Só é possível estornar lançamentos aprovados.");
  if (l.estorno_de != null) throw new DomainError("Um estorno não pode ser estornado.");
  if (l.estornado_por != null) throw new DomainError("Este lançamento já foi estornado.");
  const hoje = todayLocal();
  if (await periodoFechado(hoje)) throw new DomainError("O período de hoje está fechado.");
  const novoId = await tx(async (c) => {
    const [r] = await c.query<import("mysql2/promise").ResultSetHeader>(
      `INSERT INTO fin_lancamentos (conta_id, categoria_id, tipo, valor_centavos, data, descricao, doador_user_id, doador_nome, status, estorno_de, motivo, criado_por, aprovado_por, aprovado_em)
       VALUES (?,?,?,?,?,?,?,?, 'aprovado', ?, ?, ?, ?, UTC_TIMESTAMP())`,
      [l.conta_id, l.categoria_id, l.tipo === "entrada" ? "saida" : "entrada", l.valor_centavos, hoje, `Estorno do lançamento #${id}: ${l.descricao}`.slice(0, 255), l.doador_user_id, l.doador_nome, id, motivo, actor, actor]);
    return r.insertId;
  }).catch((e) => { if ((e as { code?: string }).code === "ER_DUP_ENTRY") throw new DomainError("Este lançamento já foi estornado."); throw e; });
  await audit(actor, "financeiro.estornar", { entidade: "lancamento", entidadeId: id, detalhes: { estorno: novoId, motivo } });
  return novoId;
}

export type Filtros = { mes?: string; tipo?: string; status?: string; contaId?: number; page?: number };
export async function listarLancamentos(actor: number, f: Filtros = {}) {
  await assertCan(actor, "financeiro", "ver", null);
  const where = ["1=1"]; const ps: unknown[] = [];
  if (f.mes && /^\d{4}-\d{2}$/.test(f.mes)) { where.push("l.data BETWEEN ? AND ?"); ps.push(`${f.mes}-01`, `${f.mes}-31`); }
  if (f.tipo === "entrada" || f.tipo === "saida") { where.push("l.tipo = ?"); ps.push(f.tipo); }
  if (f.status === "pendente" || f.status === "aprovado" || f.status === "rejeitado") { where.push("l.status = ?"); ps.push(f.status); }
  if (f.contaId) { where.push("l.conta_id = ?"); ps.push(f.contaId); }
  const page = Math.max(1, f.page ?? 1);
  const itens = await query<Lancamento & RowDataPacket>(`${SEL} WHERE ${where.join(" AND ")} ORDER BY l.data DESC, l.id DESC LIMIT ? OFFSET ?`, [...ps, PAGE, (page - 1) * PAGE]);
  const tot = await query<RowDataPacket>(`SELECT COUNT(*) n FROM fin_lancamentos l WHERE ${where.join(" AND ")}`, ps);
  const ver = await podeVerDoadores(actor);
  return { itens: itens.map((l) => mascarar(l, ver)), total: Number(tot[0].n) };
}

const n = (v: unknown) => Number(v ?? 0);
export async function saldoAte(data: string, contaId?: number): Promise<number> {
  const r = await query<RowDataPacket>(
    `SELECT COALESCE(SUM(CASE WHEN tipo='entrada' THEN valor_centavos ELSE -valor_centavos END),0) s FROM fin_lancamentos WHERE status='aprovado' AND data <= ? ${contaId ? "AND conta_id = ?" : ""}`,
    contaId ? [data, contaId] : [data]);
  return n(r[0].s);
}

export async function painel(actor: number) {
  await assertCan(actor, "financeiro", "ver", null);
  const hoje = todayLocal(); const mes = hoje.slice(0, 7);
  const [contas, mesR, pend, saldo] = await Promise.all([
    query<RowDataPacket & { id: number; nome: string; saldo: number }>(
      `SELECT c.id, c.nome, COALESCE(SUM(CASE WHEN l.status='aprovado' THEN IF(l.tipo='entrada', l.valor_centavos, -l.valor_centavos) END),0) AS saldo
       FROM fin_contas c LEFT JOIN fin_lancamentos l ON l.conta_id = c.id AND l.data <= ? WHERE c.ativa = 1 GROUP BY c.id, c.nome ORDER BY c.nome`, [hoje]),
    query<RowDataPacket>(`SELECT COALESCE(SUM(CASE WHEN tipo='entrada' THEN valor_centavos END),0) e, COALESCE(SUM(CASE WHEN tipo='saida' THEN valor_centavos END),0) s
       FROM fin_lancamentos WHERE status='aprovado' AND data BETWEEN ? AND ?`, [`${mes}-01`, `${mes}-31`]),
    query<RowDataPacket>("SELECT COUNT(*) n FROM fin_lancamentos WHERE status = 'pendente'"),
    saldoAte(hoje),
  ]);
  return { contas: contas.map((c) => ({ ...c, saldo: n(c.saldo) })), mes, entradas: n(mesR[0].e), saidas: n(mesR[0].s), pendentes: n(pend[0].n), saldo };
}

export async function relatorioMensal(actor: number, periodo: string) {
  await assertCan(actor, "financeiro", "ver", null);
  const ini = `${periodo}-01`, fim = `${periodo}-31`;
  const [cats, anterior, pend, fechado] = await Promise.all([
    query<RowDataPacket & { nome: string; tipo: "entrada" | "saida"; total: number; qtd: number }>(
      `SELECT k.nome, l.tipo, SUM(l.valor_centavos) total, COUNT(*) qtd FROM fin_lancamentos l JOIN fin_categorias k ON k.id = l.categoria_id
       WHERE l.status='aprovado' AND l.data BETWEEN ? AND ? GROUP BY k.nome, l.tipo ORDER BY l.tipo, total DESC`, [ini, fim]),
    saldoAte(addDays(ini, -1)),
    query<RowDataPacket>("SELECT COUNT(*) n FROM fin_lancamentos WHERE status='pendente' AND data BETWEEN ? AND ?", [ini, fim]),
    query<RowDataPacket & { saldo_final_centavos: number; publicado: number; fechado_em: Date }>("SELECT saldo_final_centavos, publicado, fechado_em FROM fin_periodos WHERE periodo = ?", [periodo]),
  ]);
  const entradas = cats.filter((c) => c.tipo === "entrada").reduce((a, c) => a + n(c.total), 0);
  const saidas = cats.filter((c) => c.tipo === "saida").reduce((a, c) => a + n(c.total), 0);
  return {
    periodo, categorias: cats.map((c) => ({ ...c, total: n(c.total), qtd: n(c.qtd) })), entradas, saidas, saldoAnterior: anterior,
    saldoFinal: anterior + entradas - saidas, pendentes: n(pend[0].n), fechado: fechado[0] ?? null,
  };
}

export async function fecharPeriodo(actor: number, periodo: string) {
  await assertCan(actor, "financeiro", "aprovar", null);
  if (periodo >= todayLocal().slice(0, 7)) throw new DomainError("Só é possível fechar meses já encerrados.");
  if (await query<RowDataPacket>("SELECT 1 x FROM fin_periodos WHERE periodo = ?", [periodo]).then((r) => r.length)) throw new DomainError("Período já fechado.");
  const pend = await query<RowDataPacket>("SELECT COUNT(*) n FROM fin_lancamentos WHERE status='pendente' AND data BETWEEN ? AND ?", [`${periodo}-01`, `${periodo}-31`]);
  if (n(pend[0].n) > 0) throw new DomainError(`Há ${n(pend[0].n)} lançamento(s) pendente(s) neste período. Aprove ou rejeite antes de fechar.`);
  const saldo = await saldoAte(`${periodo}-31`);
  await execute("INSERT INTO fin_periodos (periodo, fechado_por, saldo_final_centavos) VALUES (?,?,?)", [periodo, actor, saldo]);
  await audit(actor, "financeiro.fechar_periodo", { entidade: "periodo", entidadeId: periodo, detalhes: { saldo_final_centavos: saldo } });
}

/** Reabertura é exceção: exige permissão de gestão financeira (administração) e motivo, sempre auditada. */
export async function reabrirPeriodo(actor: number, periodo: string, motivo: string) {
  await assertCan(actor, "financeiro", "permissoes", null);
  const r = await execute("DELETE FROM fin_periodos WHERE periodo = ?", [periodo]);
  if (r.affectedRows === 0) throw new NotFoundError();
  await audit(actor, "financeiro.reabrir_periodo", { entidade: "periodo", entidadeId: periodo, detalhes: { motivo } });
}

export async function publicarPrestacao(actor: number, periodo: string, publicar: boolean) {
  await assertCan(actor, "financeiro", "aprovar", null);
  const r = await execute("UPDATE fin_periodos SET publicado = ? WHERE periodo = ?", [publicar ? 1 : 0, periodo]);
  if (r.affectedRows === 0) throw new DomainError("Feche o período antes de publicar a prestação de contas.");
  await audit(actor, publicar ? "financeiro.publicar_prestacao" : "financeiro.despublicar_prestacao", { entidade: "periodo", entidadeId: periodo });
}

export async function periodos(actor: number) {
  await assertCan(actor, "financeiro", "ver", null);
  return query<RowDataPacket & { periodo: string; saldo_final_centavos: number; publicado: number; fechado_em: Date }>("SELECT periodo, saldo_final_centavos, publicado, fechado_em FROM fin_periodos ORDER BY periodo DESC");
}

/** Prestação de contas para TODOS os membros: só totais por categoria de períodos fechados e publicados — nunca pessoas. */
export async function prestacaoPublica() {
  const ps = await query<RowDataPacket & { periodo: string; saldo_final_centavos: number }>("SELECT periodo, saldo_final_centavos FROM fin_periodos WHERE publicado = 1 ORDER BY periodo DESC LIMIT 24");
  const out = [];
  for (const p of ps) {
    const cats = await query<RowDataPacket & { nome: string; tipo: "entrada" | "saida"; total: number }>(
      `SELECT k.nome, l.tipo, SUM(l.valor_centavos) total FROM fin_lancamentos l JOIN fin_categorias k ON k.id = l.categoria_id
       WHERE l.status='aprovado' AND l.data BETWEEN ? AND ? GROUP BY k.nome, l.tipo ORDER BY l.tipo, total DESC`, [`${p.periodo}-01`, `${p.periodo}-31`]);
    const entradas = cats.filter((c) => c.tipo === "entrada").reduce((a, c) => a + n(c.total), 0);
    const saidas = cats.filter((c) => c.tipo === "saida").reduce((a, c) => a + n(c.total), 0);
    out.push({ periodo: p.periodo, saldoFinal: n(p.saldo_final_centavos), entradas, saidas, categorias: cats.map((c) => ({ nome: c.nome, tipo: c.tipo, total: n(c.total) })) });
  }
  return out;
}

/** Cada pessoa vê as próprias contribuições aprovadas (direito de acesso do titular). */
export const minhasContribuicoes = (actor: number) => query<RowDataPacket & { id: number; data: string; valor_centavos: number; categoria: string }>(
  `SELECT l.id, l.data, l.valor_centavos, k.nome AS categoria FROM fin_lancamentos l JOIN fin_categorias k ON k.id = l.categoria_id
   WHERE l.doador_user_id = ? AND l.status = 'aprovado' AND l.tipo = 'entrada' AND l.estorno_de IS NULL
     AND NOT EXISTS (SELECT 1 FROM fin_lancamentos e WHERE e.estorno_de = l.id) ORDER BY l.data DESC LIMIT 100`, [actor]);

export async function exportarCsv(actor: number, periodo: string) {
  await assertCan(actor, "financeiro", "exportar", null);
  const doadores = await can(actor, "contribuicoes", "exportar", null);
  const rows = await query<RowDataPacket & { id: number; data: string; tipo: string; categoria: string; conta: string; descricao: string; valor_centavos: number; status: string; estorno_de: number | null; doador: string | null }>(
    `SELECT l.id, l.data, l.tipo, k.nome AS categoria, c.nome AS conta, l.descricao, l.valor_centavos, l.status, l.estorno_de, COALESCE(d.nome, l.doador_nome) AS doador
     FROM fin_lancamentos l JOIN fin_contas c ON c.id = l.conta_id JOIN fin_categorias k ON k.id = l.categoria_id LEFT JOIN users d ON d.id = l.doador_user_id
     WHERE l.data BETWEEN ? AND ? ORDER BY l.data, l.id`, [`${periodo}-01`, `${periodo}-31`]);
  await audit(actor, "financeiro.exportar", { entidade: "periodo", entidadeId: periodo, detalhes: { com_doadores: doadores } });
  const brl = (c: number) => (Number(c) / 100).toFixed(2).replace(".", ",");
  const cab = ["Nº", "Data", "Tipo", "Categoria", "Conta", "Descrição", "Valor (R$)", "Situação", "Estorno de", ...(doadores ? ["Doador"] : [])];
  return csv([cab, ...rows.map((l) => [l.id, String(l.data), l.tipo, l.categoria, l.conta, l.descricao, `${l.tipo === "saida" ? "-" : ""}${brl(l.valor_centavos)}`, l.status, l.estorno_de ?? "", ...(doadores ? [l.doador ?? ""] : [])])]);
}

/** Conciliação: marca lançamentos conferidos com o extrato e registra a diferença (nunca altera valores). */
export async function conciliar(actor: number, contaId: number, periodo: string, saldoExtratoCentavos: number, ids: number[]) {
  await assertCan(actor, "financeiro", "aprovar", null);
  const lista = [...new Set(ids)].slice(0, 500);
  if (lista.length) await execute("UPDATE fin_lancamentos SET conciliado = 1 WHERE status='aprovado' AND conta_id = ? AND id IN (?)", [contaId, lista]);
  const r = await query<RowDataPacket>(
    `SELECT COALESCE(SUM(CASE WHEN tipo='entrada' THEN valor_centavos ELSE -valor_centavos END),0) s FROM fin_lancamentos WHERE status='aprovado' AND conciliado=1 AND conta_id=? AND data <= ?`, [contaId, `${periodo}-31`]);
  const sistema = n(r[0].s); const dif = saldoExtratoCentavos - sistema;
  await execute("INSERT INTO fin_conciliacoes (conta_id, periodo, saldo_extrato_centavos, saldo_sistema_centavos, diferenca_centavos, conferido_por) VALUES (?,?,?,?,?,?)", [contaId, periodo, saldoExtratoCentavos, sistema, dif, actor]);
  await audit(actor, "financeiro.conciliar", { entidade: "conta", entidadeId: contaId, detalhes: { periodo, diferenca_centavos: dif } });
  return { sistema, diferenca: dif };
}

export async function criarCategoria(actor: number, nome: string, tipo: "entrada" | "saida") {
  await assertCan(actor, "financeiro", "editar", null);
  await execute("INSERT INTO fin_categorias (nome, tipo) VALUES (?, ?)", [nome.trim().slice(0, 80), tipo]).catch((e) => { if ((e as { code?: string }).code === "ER_DUP_ENTRY") throw new DomainError("Categoria já existe."); throw e; });
  await audit(actor, "financeiro.categoria", { detalhes: { nome, tipo } });
}
export async function criarConta(actor: number, nome: string) {
  await assertCan(actor, "financeiro", "editar", null);
  await execute("INSERT INTO fin_contas (nome) VALUES (?)", [nome.trim().slice(0, 80)]).catch((e) => { if ((e as { code?: string }).code === "ER_DUP_ENTRY") throw new DomainError("Conta já existe."); throw e; });
  await audit(actor, "financeiro.conta", { detalhes: { nome } });
}
