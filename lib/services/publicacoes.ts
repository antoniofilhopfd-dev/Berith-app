import type { PoolConnection, ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { execute, query, tx } from "@/lib/db";
import { assertCan, can, ForbiddenError } from "@/lib/permissions";
import {
  CAMPOS_DE_CONTEUDO, REDES, TRANSICOES, STATUS, diffPalavras, problemasDoConteudo,
  type DadosConteudo, type Formato, type Prioridade, type Rede, type Status, type Trecho,
} from "@/lib/editorial";
import type { PublicacaoInput } from "@/lib/validation/editorial";
import { audit } from "./audit";
import { contasInstagram } from "@/lib/integracoes/contas";
import { DomainError, NotFoundError } from "./errors";
import { destinatariosCom, notificar, notificarSeguro } from "./notificacoes";
import { lerConfig } from "./configuracoes";

/* ================= Tipos ================= */
export type Pub = {
  id: number; titulo: string; descricao: string | null; objetivo: string | null; formato: Formato; status: Status;
  campanha_id: number | null; editoria_id: number | null; responsavel_id: number | null; prioridade: Prioridade;
  prazo: Date | null; publicar_em: Date | null; legenda: string | null; hashtags: string | null; referencias: string | null; observacoes: string | null;
  versao: number; rev: number; duplicada_de: number | null; criado_por: number | null; criado_em: Date; atualizado_em: Date;
  responsavel_nome: string | null; campanha_nome: string | null; campanha_cor: string | null; editoria_nome: string | null; editoria_cor: string | null; criado_por_nome: string | null;
};
export type PubRede = {
  id: number; publicacao_id: number; rede: Rede; legenda: string | null; hashtags: string | null; titulo_externo: string | null;
  envio: "pendente" | "agendada" | "publicando" | "publicada" | "falhou" | "cancelada"; agendada_para: Date | null; publicada_em: Date | null;
  assistida: number; post_externo_id: string | null; url_externa: string | null; tentativas: number; ultimo_erro: string | null; conta_id: string | null;
};
export type PubMidia = { id: number; ordem: number; tipo: "imagem" | "video"; nome_original: string; largura: number | null; altura: number | null; mime: string; tamanho: number };
export type Snapshot = {
  titulo: string; descricao: string | null; objetivo: string | null; formato: Formato; legenda: string | null; hashtags: string | null;
  referencias: string | null; observacoes: string | null;
  redes: { rede: Rede; legenda: string | null; hashtags: string | null; tituloExterno: string | null }[];
  midiaIds: number[];
};

const SELECT_PUB = `SELECT p.*, u.nome AS responsavel_nome, c.nome AS campanha_nome, c.cor AS campanha_cor, e.nome AS editoria_nome, e.cor AS editoria_cor, cr.nome AS criado_por_nome
  FROM publicacoes p LEFT JOIN users u ON u.id = p.responsavel_id LEFT JOIN campanhas c ON c.id = p.campanha_id
  LEFT JOIN editorias e ON e.id = p.editoria_id LEFT JOIN users cr ON cr.id = p.criado_por`;

type Q = Pick<PoolConnection, "query">;
async function q<T extends RowDataPacket>(c: Q | null, sql: string, params: unknown[] = []): Promise<T[]> {
  if (!c) return query<T>(sql, params);
  const [rows] = await c.query<T[]>(sql, params);
  return rows;
}

/* ================= Leitura ================= */
export async function carregarSnapshot(id: number, c: Q | null = null): Promise<Snapshot> {
  const p = (await q<RowDataPacket>(c, "SELECT titulo, descricao, objetivo, formato, legenda, hashtags, referencias, observacoes FROM publicacoes WHERE id = ?", [id]))[0];
  if (!p) throw new NotFoundError();
  const redes = await q<RowDataPacket>(c, "SELECT rede, legenda, hashtags, titulo_externo FROM publicacao_redes WHERE publicacao_id = ? ORDER BY rede", [id]);
  const m = await q<RowDataPacket>(c, "SELECT midia_id FROM publicacao_midias WHERE publicacao_id = ? ORDER BY ordem, midia_id", [id]);
  return {
    titulo: p.titulo, descricao: p.descricao, objetivo: p.objetivo, formato: p.formato, legenda: p.legenda, hashtags: p.hashtags, referencias: p.referencias, observacoes: p.observacoes,
    redes: redes.map((r) => ({ rede: r.rede as Rede, legenda: r.legenda, hashtags: r.hashtags, tituloExterno: r.titulo_externo })),
    midiaIds: m.map((x) => Number(x.midia_id)),
  };
}

const conteudoCanonico = (s: Snapshot) => JSON.stringify({
  t: s.titulo, d: s.descricao, o: s.objetivo, f: s.formato, l: s.legenda, h: s.hashtags,
  r: [...s.redes].sort((a, b) => a.rede.localeCompare(b.rede)).map((r) => [r.rede, r.legenda, r.hashtags, r.tituloExterno]), m: s.midiaIds,
});
const snapshotCompleto = (s: Snapshot) => JSON.stringify(s);

export async function conteudoParaValidar(id: number, c: Q | null = null): Promise<DadosConteudo> {
  const s = await carregarSnapshot(id, c);
  const midias = s.midiaIds.length
    ? await q<RowDataPacket>(c, "SELECT id, tipo, largura, altura FROM midias WHERE id IN (?)", [s.midiaIds])
    : [];
  const porId = new Map(midias.map((m) => [Number(m.id), m]));
  return {
    titulo: s.titulo, formato: s.formato, legenda: s.legenda, hashtags: s.hashtags,
    redes: s.redes.map((r) => ({ rede: r.rede, legenda: r.legenda, hashtags: r.hashtags, tituloExterno: r.tituloExterno })),
    midias: s.midiaIds.flatMap((i) => { const m = porId.get(i); return m ? [{ id: i, tipo: m.tipo as "imagem" | "video", largura: m.largura, altura: m.altura }] : []; }),
  };
}

export type Filtros = {
  status?: Status[]; rede?: Rede; responsavelId?: number; campanhaId?: number; editoriaId?: number;
  de?: Date; ate?: Date; q?: string; minhas?: number; limite?: number;
  /** Conta do Instagram (ig_id): mostra o que é dela e o que ainda não tem conta definida. */
  contaId?: string;
};

function montarWhere(f: Filtros) {
  const w: string[] = []; const p: unknown[] = [];
  if (f.status?.length) { w.push("p.status IN (?)"); p.push(f.status); }
  if (f.rede) { w.push("EXISTS (SELECT 1 FROM publicacao_redes r WHERE r.publicacao_id = p.id AND r.rede = ?)"); p.push(f.rede); }
  if (f.contaId) { w.push("(EXISTS (SELECT 1 FROM publicacao_redes r WHERE r.publicacao_id = p.id AND r.conta_id = ?) OR NOT EXISTS (SELECT 1 FROM publicacao_redes r WHERE r.publicacao_id = p.id AND r.conta_id IS NOT NULL))"); p.push(f.contaId); }
  if (f.responsavelId) { w.push("p.responsavel_id = ?"); p.push(f.responsavelId); }
  if (f.campanhaId) { w.push("p.campanha_id = ?"); p.push(f.campanhaId); }
  if (f.editoriaId) { w.push("p.editoria_id = ?"); p.push(f.editoriaId); }
  if (f.de) { w.push("p.publicar_em >= ?"); p.push(f.de); }
  if (f.ate) { w.push("p.publicar_em < ?"); p.push(f.ate); }
  if (f.minhas) { w.push("(p.responsavel_id = ? OR p.criado_por = ?)"); p.push(f.minhas, f.minhas); }
  if (f.q) { w.push("(p.titulo LIKE ? OR p.legenda LIKE ?)"); const l = `%${f.q.replace(/[%_\\]/g, "\\$&")}%`; p.push(l, l); }
  return { where: w.length ? `WHERE ${w.join(" AND ")}` : "", params: p };
}

export async function listar(actor: number, f: Filtros = {}): Promise<(Pub & { redes: Rede[] })[]> {
  await assertCan(actor, "producao", "ver");
  const { where, params } = montarWhere(f);
  const rows = await query<Pub & RowDataPacket>(`${SELECT_PUB} ${where} ORDER BY COALESCE(p.publicar_em, p.prazo, p.criado_em) DESC, p.id DESC LIMIT ?`, [...params, Math.min(f.limite ?? 300, 500)]);
  if (rows.length === 0) return [];
  const redes = await query<RowDataPacket>("SELECT publicacao_id, rede FROM publicacao_redes WHERE publicacao_id IN (?) ORDER BY rede", [rows.map((r) => r.id)]);
  const por = new Map<number, Rede[]>();
  for (const r of redes) por.set(Number(r.publicacao_id), [...(por.get(Number(r.publicacao_id)) ?? []), r.rede as Rede]);
  return rows.map((r) => ({ ...r, redes: por.get(r.id) ?? [] }));
}

export async function getPub(actor: number, id: number) {
  await assertCan(actor, "producao", "ver");
  const p = (await query<Pub & RowDataPacket>(`${SELECT_PUB} WHERE p.id = ?`, [id]))[0];
  if (!p) throw new NotFoundError();
  const [redes, midias] = await Promise.all([
    query<PubRede & RowDataPacket>("SELECT * FROM publicacao_redes WHERE publicacao_id = ? ORDER BY FIELD(rede,'instagram','facebook','tiktok','youtube')", [id]),
    query<PubMidia & RowDataPacket>(
      `SELECT m.id, pm.ordem, m.tipo, m.nome_original, m.largura, m.altura, m.mime, m.tamanho FROM publicacao_midias pm JOIN midias m ON m.id = pm.midia_id WHERE pm.publicacao_id = ? ORDER BY pm.ordem, m.id`, [id]),
  ]);
  const editar = await podeEditar(actor, p);
  return { pub: p, redes, midias, podeEditar: editar };
}

export async function podeEditar(actor: number, p: { criado_por: number | null; responsavel_id: number | null; status: Status }): Promise<boolean> {
  if (p.status === "publicado") return false;
  if (!(await can(actor, "producao", "editar"))) return false;
  return (await can(actor, "producao", "excluir")) || p.criado_por === actor || p.responsavel_id === actor;
}

/* ================= Histórico ================= */
async function registrar(c: Q, pubId: number, actor: number | null, acao: string, o: { de?: string | null; para?: string | null; detalhes?: string | null } = {}) {
  await c.query("INSERT INTO publicacao_historico (publicacao_id, user_id, acao, de_status, para_status, detalhes) VALUES (?,?,?,?,?,?)",
    [pubId, actor, acao, o.de ?? null, o.para ?? null, o.detalhes?.slice(0, 600) ?? null]);
}

export type EventoHistorico = { id: number; acao: string; de_status: string | null; para_status: string | null; detalhes: string | null; criado_em: Date; nome: string | null };
export async function historico(actor: number, id: number): Promise<EventoHistorico[]> {
  await assertCan(actor, "producao", "ver");
  return query<EventoHistorico & RowDataPacket>(
    `SELECT h.id, h.acao, h.de_status, h.para_status, h.detalhes, h.criado_em, u.nome FROM publicacao_historico h LEFT JOIN users u ON u.id = h.user_id WHERE h.publicacao_id = ? ORDER BY h.id DESC LIMIT 200`, [id]);
}

/* ================= Versões ================= */
export async function novaVersao(c: Q, pubId: number, actor: number | null, motivo: string): Promise<number> {
  const snap = await carregarSnapshot(pubId, c);
  const ult = (await q<RowDataPacket>(c, "SELECT versao, dados FROM publicacao_versoes WHERE publicacao_id = ? ORDER BY versao DESC LIMIT 1", [pubId]))[0];
  const completo = snapshotCompleto(snap);
  if (ult && ult.dados === completo) return Number(ult.versao);
  const n = ult ? Number(ult.versao) + 1 : 1;
  await c.query("INSERT INTO publicacao_versoes (publicacao_id, versao, dados, motivo, autor_id) VALUES (?,?,?,?,?)", [pubId, n, completo, motivo.slice(0, 200), actor]);
  await c.query("UPDATE publicacoes SET versao = ? WHERE id = ?", [n, pubId]);
  return n;
}

export async function versoes(actor: number, id: number) {
  await assertCan(actor, "producao", "ver");
  return query<RowDataPacket & { versao: number; motivo: string | null; criado_em: Date; autor: string | null }>(
    `SELECT v.versao, v.motivo, v.criado_em, u.nome AS autor FROM publicacao_versoes v LEFT JOIN users u ON u.id = v.autor_id WHERE v.publicacao_id = ? ORDER BY v.versao DESC`, [id]);
}

export async function salvarVersaoManual(actor: number, id: number, motivo: string) {
  const { pub, podeEditar: ok } = await getPub(actor, id);
  if (!ok) throw new ForbiddenError();
  const n = await tx((c) => novaVersao(c, id, actor, motivo.trim() || "Versão salva manualmente"));
  await audit(actor, "publicacao.versao", { entidade: "publicacao", entidadeId: pub.id, detalhes: { versao: n } });
  return n;
}

export type Comparacao = { campo: string; rotulo: string; trechos: Trecho[]; mudou: boolean };
const ROTULOS: Record<string, string> = { titulo: "Título interno", descricao: "Descrição", objetivo: "Objetivo", formato: "Formato", legenda: "Legenda", hashtags: "Hashtags", referencias: "Referências", observacoes: "Observações" };

/** Compara duas versões (b = null → compara `a` com o conteúdo atual em edição). */
export async function compararVersoes(actor: number, id: number, a: number, b: number | null): Promise<Comparacao[]> {
  await assertCan(actor, "producao", "ver");
  const carregar = async (v: number) => {
    const r = (await query<RowDataPacket>("SELECT dados FROM publicacao_versoes WHERE publicacao_id = ? AND versao = ?", [id, v]))[0];
    if (!r) throw new NotFoundError();
    return JSON.parse(r.dados as string) as Snapshot;
  };
  const sa = await carregar(a);
  const sb = b == null ? await carregarSnapshot(id) : await carregar(b);
  const out: Comparacao[] = [];
  for (const k of Object.keys(ROTULOS) as (keyof typeof ROTULOS)[]) {
    const va = String((sa as unknown as Record<string, unknown>)[k] ?? ""), vb = String((sb as unknown as Record<string, unknown>)[k] ?? "");
    out.push({ campo: k, rotulo: ROTULOS[k], trechos: diffPalavras(va, vb), mudou: va !== vb });
  }
  const redesTxt = (s: Snapshot) => s.redes.map((r) => `${r.rede}: ${r.legenda ?? "(herda)"} | ${r.hashtags ?? "(herda)"} | ${r.tituloExterno ?? ""}`).join("\n");
  out.push({ campo: "redes", rotulo: "Redes e ajustes por rede", trechos: diffPalavras(redesTxt(sa), redesTxt(sb)), mudou: redesTxt(sa) !== redesTxt(sb) });
  const mid = (s: Snapshot) => s.midiaIds.map((i) => `#${i}`).join(" ");
  out.push({ campo: "midias", rotulo: "Mídias (ordem)", trechos: diffPalavras(mid(sa), mid(sb)), mudou: mid(sa) !== mid(sb) });
  return out;
}

/* ================= Escrita ================= */
type Extras = { prazo: Date | null; publicarEm: Date | null };

async function validarReferencias(c: Q, d: PublicacaoInput) {
  const checks: [string, number | null, string][] = [["campanhas", d.campanhaId, "Campanha"], ["editorias", d.editoriaId, "Editoria"]];
  for (const [tab, id, nome] of checks) if (id != null && !(await q<RowDataPacket>(c, `SELECT 1 x FROM ${tab} WHERE id = ?`, [id]))[0]) throw new DomainError(`${nome} inexistente.`);
  if (d.responsavelId != null && !(await q<RowDataPacket>(c, "SELECT 1 x FROM users WHERE id = ? AND status = 'ativo'", [d.responsavelId]))[0]) throw new DomainError("Responsável inexistente ou inativo.");
  if (d.midiaIds.length) {
    const ok = await q<RowDataPacket>(c, "SELECT id FROM midias WHERE id IN (?) AND removido_em IS NULL", [d.midiaIds]);
    if (ok.length !== d.midiaIds.length) throw new DomainError("Alguma mídia escolhida não existe mais na biblioteca.");
  }
}

/** Contas do Instagram conectadas: ids válidos e a padrão (principal) para quem não escolheu. */
const r_ig = (l: Awaited<ReturnType<typeof contasInstagram>>) => ({ ids: l.map((c) => c.igId), principal: (l.find((c) => c.principal) ?? l[0])?.igId ?? null });

async function sincronizarRedesEMidias(c: Q, id: number, d: PublicacaoInput) {
  const atuais = await q<RowDataPacket>(c, "SELECT rede, envio FROM publicacao_redes WHERE publicacao_id = ?", [id]);
  for (const a of atuais) {
    if (!d.redes.includes(a.rede as Rede)) {
      if (a.envio === "publicada" || a.envio === "publicando") throw new DomainError(`Não é possível remover ${a.rede}: já publicada ou em publicação.`);
      await c.query("DELETE FROM publicacao_redes WHERE publicacao_id = ? AND rede = ?", [id, a.rede]);
    }
  }
  const contas = r_ig(await contasInstagram());
  for (const r of d.redes) {
    const x = d.redesExtra[r];
    let contaId: string | null = null;
    if (r === "instagram") {
      contaId = x?.contaId ?? contas.principal;
      if (contaId && !contas.ids.includes(contaId)) throw new DomainError("A conta do Instagram escolhida não está conectada.");
    }
    await c.query(
      `INSERT INTO publicacao_redes (publicacao_id, rede, legenda, hashtags, titulo_externo, conta_id) VALUES (?,?,?,?,?,?)
       ON DUPLICATE KEY UPDATE legenda = VALUES(legenda), hashtags = VALUES(hashtags), titulo_externo = VALUES(titulo_externo),
         conta_id = IF(envio IN ('publicada','publicando'), conta_id, COALESCE(VALUES(conta_id), conta_id))`,
      [id, r, x?.legenda ?? null, x?.hashtags ?? null, x?.tituloExterno ?? null, contaId]);
  }
  await c.query("DELETE FROM publicacao_midias WHERE publicacao_id = ?", [id]);
  for (let i = 0; i < d.midiaIds.length; i++) await c.query("INSERT INTO publicacao_midias (publicacao_id, midia_id, ordem) VALUES (?,?,?)", [id, d.midiaIds[i], i]);
}

export async function criar(actor: number, d: PublicacaoInput, x: Extras, o: { duplicadaDe?: number | null } = {}): Promise<number> {
  await assertCan(actor, "producao", "criar");
  const id = await tx(async (c) => {
    await validarReferencias(c, d);
    const [r] = await c.query<ResultSetHeader>(
      `INSERT INTO publicacoes (titulo, descricao, objetivo, formato, status, campanha_id, editoria_id, responsavel_id, prioridade, prazo, publicar_em, legenda, hashtags, referencias, observacoes, duplicada_de, criado_por)
       VALUES (?,?,?,?, 'rascunho', ?,?,?,?,?,?,?,?,?,?,?,?)`,
      [d.titulo, d.descricao, d.objetivo, d.formato, d.campanhaId, d.editoriaId, d.responsavelId ?? actor, d.prioridade, x.prazo, x.publicarEm, d.legenda, d.hashtags, d.referencias, d.observacoes, o.duplicadaDe ?? null, actor]);
    await sincronizarRedesEMidias(c, r.insertId, d);
    await novaVersao(c, r.insertId, actor, o.duplicadaDe ? "Cópia criada" : "Versão inicial");
    await registrar(c, r.insertId, actor, o.duplicadaDe ? "duplicar" : "criar", { para: "rascunho", detalhes: o.duplicadaDe ? `Cópia da publicação #${o.duplicadaDe}` : null });
    return r.insertId;
  });
  await audit(actor, "publicacao.criar", { entidade: "publicacao", entidadeId: id });
  const resp = d.responsavelId ?? actor;
  if (resp !== actor) await notificarSeguro(() => notificar([resp], { tipo: "publicacao", titulo: `Nova produção para você: ${d.titulo}`, url: `/producao/${id}`, dedupeKey: `resp:${id}:${resp}` }));
  return id;
}

export type ResultadoSalvar = { rev: number; status: Status; invalidou: boolean; mudou: string[] };

export async function atualizar(actor: number, id: number, d: PublicacaoInput, x: Extras, o: { autosave?: boolean; baseRev?: number } = {}): Promise<ResultadoSalvar> {
  const out = await tx(async (c) => {
    const [rows] = await c.query<(Pub & RowDataPacket)[]>(`${SELECT_PUB} WHERE p.id = ? FOR UPDATE`, [id]);
    const p = rows[0];
    if (!p) throw new NotFoundError();
    if (!(await podeEditar(actor, p))) { if (!(await can(actor, "producao", "ver"))) throw new NotFoundError(); throw new ForbiddenError(); }
    if (p.status === "cancelado") throw new DomainError("Publicação cancelada. Reabra para editar.");
    if (o.baseRev != null && o.baseRev !== p.rev) throw new DomainError("Outra pessoa alterou esta publicação. Recarregue a página para ver a versão mais recente.");
    await validarReferencias(c, d);
    const antes = await carregarSnapshot(id, c);
    await c.query(
      `UPDATE publicacoes SET titulo=?, descricao=?, objetivo=?, formato=?, campanha_id=?, editoria_id=?, responsavel_id=?, prioridade=?, prazo=?, publicar_em=?, legenda=?, hashtags=?, referencias=?, observacoes=?, rev = rev + 1 WHERE id = ?`,
      [d.titulo, d.descricao, d.objetivo, d.formato, d.campanhaId, d.editoriaId, d.responsavelId, d.prioridade, x.prazo, x.publicarEm, d.legenda, d.hashtags, d.referencias, d.observacoes, id]);
    await sincronizarRedesEMidias(c, id, d);
    const depois = await carregarSnapshot(id, c);
    const mudouConteudo = conteudoCanonico(antes) !== conteudoCanonico(depois);
    const mudou = (CAMPOS_DE_CONTEUDO as readonly string[]).filter((k) => {
      if (k === "redes") return JSON.stringify(antes.redes) !== JSON.stringify(depois.redes);
      if (k === "midiaIds") return JSON.stringify(antes.midiaIds) !== JSON.stringify(depois.midiaIds);
      return (antes as unknown as Record<string, unknown>)[k] !== (depois as unknown as Record<string, unknown>)[k];
    });
    let status = p.status, invalidou = false;
    if (mudouConteudo && (p.status === "em_revisao" || p.status === "aprovado" || p.status === "agendado")) {
      status = "em_producao"; invalidou = true;
      await c.query("UPDATE publicacoes SET status = 'em_producao' WHERE id = ?", [id]);
      await c.query("UPDATE publicacao_redes SET envio = 'pendente', agendada_para = NULL WHERE publicacao_id = ? AND envio IN ('agendada','falhou')", [id]);
      await registrar(c, id, actor, "conteudo_alterado", { de: p.status, para: "em_producao", detalhes: `Conteúdo alterado (${mudou.join(", ")}); a aprovação anterior foi invalidada.` });
    } else if (!o.autosave && mudou.length) {
      await registrar(c, id, actor, "editar", { detalhes: `Alterou: ${mudou.join(", ")}` });
    }
    const rev = (await q<RowDataPacket>(c, "SELECT rev FROM publicacoes WHERE id = ?", [id]))[0].rev as number;
    return { res: { rev, status, invalidou, mudou } as ResultadoSalvar, antes: p, novoResp: d.responsavelId };
  });
  if (!o.autosave) await audit(actor, "publicacao.editar", { entidade: "publicacao", entidadeId: id });
  if (out.novoResp && out.novoResp !== out.antes.responsavel_id && out.novoResp !== actor) {
    await notificarSeguro(() => notificar([out.novoResp!], { tipo: "publicacao", titulo: `Você é o responsável por: ${d.titulo}`, url: `/producao/${id}`, dedupeKey: `resp:${id}:${out.novoResp}` }));
  }
  return out.res;
}

/* ================= Fluxo de aprovação ================= */
async function exigirTransicao(de: Status, para: Status) {
  if (!TRANSICOES[de].includes(para)) throw new DomainError(`Não é possível ir de “${de}” para “${para}”.`);
}

export async function iniciarProducao(actor: number, id: number) {
  await tx(async (c) => {
    const [rows] = await c.query<(Pub & RowDataPacket)[]>(`${SELECT_PUB} WHERE p.id = ? FOR UPDATE`, [id]);
    const p = rows[0]; if (!p) throw new NotFoundError();
    if (!(await podeEditar(actor, p))) throw new ForbiddenError();
    await exigirTransicao(p.status, "em_producao");
    await c.query("UPDATE publicacoes SET status = 'em_producao', rev = rev + 1 WHERE id = ?", [id]);
    await c.query("UPDATE publicacao_redes SET envio = 'pendente', agendada_para = NULL WHERE publicacao_id = ? AND envio IN ('agendada','falhou')", [id]);
    await registrar(c, id, actor, "status", { de: p.status, para: "em_producao" });
  });
  await audit(actor, "publicacao.status", { entidade: "publicacao", entidadeId: id, detalhes: { para: "em_producao" } });
}

export async function problemas(id: number): Promise<string[]> {
  return problemasDoConteudo(await conteudoParaValidar(id));
}

export async function enviarParaRevisao(actor: number, id: number) {
  const titulo = await tx(async (c) => {
    const [rows] = await c.query<(Pub & RowDataPacket)[]>(`${SELECT_PUB} WHERE p.id = ? FOR UPDATE`, [id]);
    const p = rows[0]; if (!p) throw new NotFoundError();
    if (!(await podeEditar(actor, p))) throw new ForbiddenError();
    await exigirTransicao(p.status, "em_revisao");
    const prob = problemasDoConteudo(await conteudoParaValidar(id, c));
    if (prob.length) throw new DomainError(`Complete antes de enviar para revisão: ${prob.join(" ")}`);
    const v = await novaVersao(c, id, actor, "Enviado para revisão");
    await c.query("UPDATE publicacoes SET status = 'em_revisao', rev = rev + 1 WHERE id = ?", [id]);
    await registrar(c, id, actor, "status", { de: p.status, para: "em_revisao", detalhes: `Versão ${v}` });
    return p.titulo;
  });
  await audit(actor, "publicacao.status", { entidade: "publicacao", entidadeId: id, detalhes: { para: "em_revisao" } });
  await notificarSeguro(async () => notificar(await destinatariosCom("aprovacao", "aprovar", [actor]), { tipo: "aprovacao", titulo: `Aguardando aprovação: ${titulo}`, url: `/aprovacoes/${id}`, dedupeKey: `aprov:${id}:${Date.now()}` }));
}

export async function decidir(actor: number, id: number, decisao: "aprovado" | "ajustes", comentario: string | null) {
  await assertCan(actor, "aprovacao", "aprovar");
  const cfg = await lerConfig();
  const out = await tx(async (c) => {
    const [rows] = await c.query<(Pub & RowDataPacket)[]>(`${SELECT_PUB} WHERE p.id = ? FOR UPDATE`, [id]);
    const p = rows[0]; if (!p) throw new NotFoundError();
    if (p.status !== "em_revisao") throw new DomainError("Esta publicação não está aguardando revisão.");
    if (cfg.impedirAutoaprovacao && (p.criado_por === actor || p.responsavel_id === actor)) throw new DomainError("A configuração do ministério não permite aprovar o próprio conteúdo.");
    const txt = comentario?.trim() || null;
    if (decisao === "ajustes" && !txt) throw new DomainError("Explique quais ajustes são necessários.");
    const para: Status = decisao === "aprovado" ? "aprovado" : "ajustes_solicitados";
    await c.query("INSERT INTO aprovacoes (publicacao_id, versao, decisao, user_id, comentario) VALUES (?,?,?,?,?)", [id, p.versao, decisao, actor, txt]);
    if (decisao === "ajustes") await c.query("INSERT INTO pub_comentarios (publicacao_id, user_id, texto, tipo) VALUES (?,?,?, 'ajuste')", [id, actor, txt]);
    else if (txt) await c.query("INSERT INTO pub_comentarios (publicacao_id, user_id, texto, tipo) VALUES (?,?,?, 'comentario')", [id, actor, txt]);
    await c.query("UPDATE publicacoes SET status = ?, rev = rev + 1 WHERE id = ?", [para, id]);
    await registrar(c, id, actor, decisao === "aprovado" ? "aprovar" : "solicitar_ajustes", { de: "em_revisao", para, detalhes: `Versão ${p.versao}${txt ? `: ${txt}` : ""}` });
    return { p, para };
  });
  await audit(actor, `publicacao.${decisao === "aprovado" ? "aprovar" : "ajustes"}`, { entidade: "publicacao", entidadeId: id });
  const quem = [out.p.responsavel_id, out.p.criado_por].filter((x): x is number => x != null && x !== actor);
  await notificarSeguro(() => notificar(quem, {
    tipo: "ajuste", titulo: decisao === "aprovado" ? `Aprovado: ${out.p.titulo}` : `Ajustes solicitados: ${out.p.titulo}`,
    corpo: comentario?.slice(0, 280) ?? null, url: `/producao/${id}`, dedupeKey: `decisao:${id}:${Date.now()}`,
  }));
}

export async function cancelar(actor: number, id: number, motivo: string | null) {
  await tx(async (c) => {
    const [rows] = await c.query<(Pub & RowDataPacket)[]>(`${SELECT_PUB} WHERE p.id = ? FOR UPDATE`, [id]);
    const p = rows[0]; if (!p) throw new NotFoundError();
    if (!(await podeEditar(actor, p))) throw new ForbiddenError();
    await exigirTransicao(p.status, "cancelado");
    await c.query("UPDATE publicacoes SET status = 'cancelado', rev = rev + 1 WHERE id = ?", [id]);
    await c.query("UPDATE publicacao_redes SET envio = 'cancelada', agendada_para = NULL WHERE publicacao_id = ? AND envio IN ('pendente','agendada','falhou')", [id]);
    await registrar(c, id, actor, "cancelar", { de: p.status, para: "cancelado", detalhes: motivo });
  });
  await audit(actor, "publicacao.cancelar", { entidade: "publicacao", entidadeId: id });
}

export async function reabrir(actor: number, id: number) {
  await tx(async (c) => {
    const [rows] = await c.query<(Pub & RowDataPacket)[]>(`${SELECT_PUB} WHERE p.id = ? FOR UPDATE`, [id]);
    const p = rows[0]; if (!p) throw new NotFoundError();
    if (!(await podeEditar(actor, { ...p, status: "rascunho" }))) throw new ForbiddenError();
    await exigirTransicao(p.status, "rascunho");
    await c.query("UPDATE publicacoes SET status = 'rascunho', rev = rev + 1 WHERE id = ?", [id]);
    await c.query("UPDATE publicacao_redes SET envio = 'pendente' WHERE publicacao_id = ? AND envio = 'cancelada'", [id]);
    await registrar(c, id, actor, "reabrir", { de: "cancelado", para: "rascunho" });
  });
  await audit(actor, "publicacao.reabrir", { entidade: "publicacao", entidadeId: id });
}

export async function excluir(actor: number, id: number) {
  await assertCan(actor, "producao", "excluir");
  const p = (await query<RowDataPacket>("SELECT status, titulo FROM publicacoes WHERE id = ?", [id]))[0];
  if (!p) throw new NotFoundError();
  if (p.status !== "rascunho" && p.status !== "cancelado") throw new DomainError("Só é possível excluir rascunhos ou publicações canceladas. Para as demais, cancele.");
  await execute("DELETE FROM publicacoes WHERE id = ?", [id]);
  await audit(actor, "publicacao.excluir", { entidade: "publicacao", entidadeId: id, detalhes: { titulo: p.titulo } });
}

export async function duplicar(actor: number, id: number): Promise<number> {
  await assertCan(actor, "producao", "criar");
  const { pub, redes, midias } = await getPub(actor, id);
  const d: PublicacaoInput = {
    titulo: `${pub.titulo} (cópia)`.slice(0, 160), descricao: pub.descricao, objetivo: pub.objetivo, formato: pub.formato,
    redes: redes.map((r) => r.rede), campanhaId: pub.campanha_id, editoriaId: pub.editoria_id, responsavelId: actor, prioridade: pub.prioridade,
    legenda: pub.legenda, hashtags: pub.hashtags, referencias: pub.referencias, observacoes: null, midiaIds: midias.map((m) => m.id),
    redesExtra: Object.fromEntries(redes.map((r) => [r.rede, { legenda: r.legenda, hashtags: r.hashtags, tituloExterno: r.titulo_externo }])),
  };
  return criar(actor, d, { prazo: null, publicarEm: null }, { duplicadaDe: id });
}

/* ================= Comentários ================= */
export type Comentario = { id: number; texto: string; tipo: "comentario" | "ajuste"; resolvido_em: Date | null; criado_em: Date; autor: string | null; user_id: number | null };
export async function comentarios(actor: number, id: number): Promise<Comentario[]> {
  await assertCan(actor, "producao", "ver");
  return query<Comentario & RowDataPacket>(
    `SELECT c.id, c.texto, c.tipo, c.resolvido_em, c.criado_em, c.user_id, u.nome AS autor FROM pub_comentarios c LEFT JOIN users u ON u.id = c.user_id WHERE c.publicacao_id = ? ORDER BY c.id`, [id]);
}

export async function comentar(actor: number, id: number, texto: string, tipo: "comentario" | "ajuste" = "comentario") {
  await assertCan(actor, "producao", "ver");
  const p = (await query<RowDataPacket>("SELECT titulo, responsavel_id, criado_por FROM publicacoes WHERE id = ?", [id]))[0];
  if (!p) throw new NotFoundError();
  if (tipo === "ajuste") await assertCan(actor, "aprovacao", "aprovar");
  const r = await execute("INSERT INTO pub_comentarios (publicacao_id, user_id, texto, tipo) VALUES (?,?,?,?)", [id, actor, texto, tipo]);
  const antes = await query<RowDataPacket>("SELECT DISTINCT user_id FROM pub_comentarios WHERE publicacao_id = ? AND user_id IS NOT NULL", [id]);
  const quem = [...new Set([p.responsavel_id, p.criado_por, ...antes.map((x) => x.user_id)].filter((x): x is number => x != null && x !== actor))];
  await notificarSeguro(() => notificar(quem, { tipo: "comentario", titulo: `Novo comentário em ${p.titulo}`, corpo: texto.slice(0, 200), url: `/producao/${id}#comentarios`, dedupeKey: `com:${r.insertId}` }));
  return r.insertId;
}

export async function resolverComentario(actor: number, comentarioId: number) {
  const c = (await query<RowDataPacket>("SELECT publicacao_id FROM pub_comentarios WHERE id = ?", [comentarioId]))[0];
  if (!c) throw new NotFoundError();
  const p = (await query<Pub & RowDataPacket>(`${SELECT_PUB} WHERE p.id = ?`, [c.publicacao_id]))[0];
  if (!(await podeEditar(actor, p)) && !(await can(actor, "aprovacao", "aprovar"))) throw new ForbiddenError();
  await execute("UPDATE pub_comentarios SET resolvido_em = UTC_TIMESTAMP(), resolvido_por = ? WHERE id = ? AND resolvido_em IS NULL", [actor, comentarioId]);
}

export async function historicoAprovacao(actor: number, id: number) {
  await assertCan(actor, "producao", "ver");
  return query<RowDataPacket & { versao: number; decisao: "aprovado" | "ajustes"; comentario: string | null; criado_em: Date; nome: string | null }>(
    `SELECT a.versao, a.decisao, a.comentario, a.criado_em, u.nome FROM aprovacoes a LEFT JOIN users u ON u.id = a.user_id WHERE a.publicacao_id = ? ORDER BY a.id DESC`, [id]);
}

/* ================= Modelos ================= */
export async function listarModelos(actor: number) {
  await assertCan(actor, "producao", "ver");
  return query<RowDataPacket & { id: number; nome: string; formato: Formato; redes: string; objetivo: string | null; legenda: string | null; hashtags: string | null }>(
    "SELECT id, nome, formato, redes, objetivo, legenda, hashtags FROM modelos ORDER BY nome");
}
export async function criarModelo(actor: number, d: { nome: string; formato: Formato; redes: Rede[]; objetivo: string | null; legenda: string | null; hashtags: string | null }) {
  await assertCan(actor, "producao", "criar");
  const r = await execute("INSERT INTO modelos (nome, formato, redes, objetivo, legenda, hashtags, criado_por) VALUES (?,?,?,?,?,?,?)",
    [d.nome, d.formato, d.redes.join(",") || "instagram", d.objetivo, d.legenda, d.hashtags, actor]);
  await audit(actor, "modelo.criar", { entidade: "modelo", entidadeId: r.insertId });
  return r.insertId;
}
export async function modeloDaPublicacao(actor: number, id: number, nome: string) {
  const { pub, redes } = await getPub(actor, id);
  return criarModelo(actor, { nome, formato: pub.formato, redes: redes.map((r) => r.rede), objetivo: pub.objetivo, legenda: pub.legenda, hashtags: pub.hashtags });
}
export async function excluirModelo(actor: number, id: number) {
  await assertCan(actor, "producao", "excluir");
  await execute("DELETE FROM modelos WHERE id = ?", [id]);
  await audit(actor, "modelo.excluir", { entidade: "modelo", entidadeId: id });
}
export async function criarDeModelo(actor: number, modeloId: number, titulo: string): Promise<number> {
  await assertCan(actor, "producao", "criar");
  const m = (await query<RowDataPacket>("SELECT * FROM modelos WHERE id = ?", [modeloId]))[0];
  if (!m) throw new NotFoundError();
  const redes = String(m.redes).split(",").filter((x): x is Rede => (REDES as readonly string[]).includes(x));
  const d: PublicacaoInput = {
    titulo, descricao: null, objetivo: m.objetivo, formato: m.formato, redes, campanhaId: null, editoriaId: null, responsavelId: actor, prioridade: "media",
    legenda: m.legenda, hashtags: m.hashtags, referencias: null, observacoes: null, midiaIds: [], redesExtra: {},
  };
  return criar(actor, d, { prazo: null, publicarEm: null });
}

export const STATUS_VALIDOS = STATUS;
