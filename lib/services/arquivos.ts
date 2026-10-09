import { createHash, randomBytes } from "node:crypto";
import type { RowDataPacket } from "mysql2/promise";
import { execute, query } from "@/lib/db";
import { accessibleUnitIds, assertCan, can, ForbiddenError } from "@/lib/permissions";
import { detectarTipo, EXTENSOES_ACEITAS, MAX_BYTES, nomeSeguro } from "@/lib/storage/tipos";
import * as disco from "@/lib/storage/disco";
import type { z } from "zod";
import type { albumSchema } from "@/lib/validation/formacao";
import { getComunicado } from "./comunicados";
import { getConteudo } from "./formacao";
import { getTask } from "./tarefas";
import { DomainError, NotFoundError } from "./errors";
import { audit } from "./audit";

export type CtxTipo = "comunicado" | "tarefa" | "conteudo" | "album" | "documento";
export const CTX_TIPOS: readonly CtxTipo[] = ["comunicado", "tarefa", "conteudo", "album", "documento"];
export type Arquivo = {
  id: number; arquivo: string; nome_original: string; mime: string; tamanho: number; ctx_tipo: CtxTipo; ctx_id: number;
  descricao: string | null; autorizacao_imagem: number; criado_por: number; criado_em: Date;
};
const MAX_POR_CONTEXTO: Record<CtxTipo, number> = { comunicado: 10, tarefa: 20, conteudo: 20, album: 300, documento: 500 };

type Dono = { unitId: number | null; permitirDownload: boolean };

/** Resolve o dono do contexto e confere se o usuário enxerga o contexto (404 caso contrário). */
async function dono(actor: number, tipo: CtxTipo, id: number): Promise<Dono> {
  switch (tipo) {
    case "comunicado": { const a = await getComunicado(actor, id); return { unitId: a.unit_id, permitirDownload: true }; }
    case "tarefa": { const t = await getTask(actor, id); return { unitId: t.tarefa.unit_id, permitirDownload: true }; }
    case "conteudo": { const c = await getConteudo(actor, id); return { unitId: c.unit_id, permitirDownload: true }; }
    case "album": {
      const r = await query<RowDataPacket>("SELECT unit_id, permitir_download FROM albums WHERE id = ?", [id]);
      if (!r[0] || (r[0].unit_id != null && !(await can(actor, "midia", "ver", r[0].unit_id)))) throw new NotFoundError();
      return { unitId: r[0].unit_id, permitirDownload: Boolean(r[0].permitir_download) };
    }
    case "documento": {
      const unitId = id === 0 ? null : id; // ctx_id 0 = biblioteca da comunidade
      if (unitId != null) {
        const u = await query<RowDataPacket>("SELECT 1 x FROM org_units WHERE id = ?", [unitId]);
        if (!u[0] || !(await can(actor, "midia", "ver", unitId))) throw new NotFoundError();
      }
      return { unitId, permitirDownload: true };
    }
  }
}

async function podeGerir(actor: number, tipo: CtxTipo, ctxId: number, d: Dono, acao: "subir" | "excluir", dono_arquivo?: number): Promise<boolean> {
  switch (tipo) {
    case "comunicado": return can(actor, "comunicados", "editar", d.unitId);
    case "conteudo": return can(actor, "conteudos", "editar", d.unitId);
    case "album": case "documento": return can(actor, "midia", acao === "subir" ? "criar" : "excluir", d.unitId);
    case "tarefa": {
      if (await can(actor, "tarefas", "editar", d.unitId)) return true;
      const t = await getTask(actor, ctxId);
      return t.souResponsavel && (acao === "subir" || dono_arquivo === actor); // responsável anexa; só remove o que enviou
    }
  }
}

export async function listarAnexos(actor: number, tipo: CtxTipo, ctxId: number): Promise<{ arquivos: Arquivo[]; podeSubir: boolean; podeExcluir: (a: Arquivo) => boolean; permitirDownload: boolean }> {
  const d = await dono(actor, tipo, ctxId);
  const arquivos = await query<Arquivo & RowDataPacket>(
    "SELECT id, arquivo, nome_original, mime, tamanho, ctx_tipo, ctx_id, descricao, autorizacao_imagem, criado_por, criado_em FROM files WHERE ctx_tipo = ? AND ctx_id = ? ORDER BY criado_em DESC, id DESC", [tipo, ctxId]);
  const subir = await podeGerir(actor, tipo, ctxId, d, "subir");
  const excluirTudo = await podeGerir(actor, tipo, ctxId, d, "excluir", -1);
  const excluirProprios = tipo === "tarefa" ? await podeGerir(actor, tipo, ctxId, d, "excluir", actor) : excluirTudo;
  return { arquivos, podeSubir: subir, podeExcluir: (a) => excluirTudo || (excluirProprios && a.criado_por === actor), permitirDownload: d.permitirDownload };
}

export async function enviarArquivo(actor: number, o: { tipo: CtxTipo; ctxId: number; nome: string; dados: Uint8Array; descricao?: string | null; autorizacaoImagem?: boolean }) {
  const d = await dono(actor, o.tipo, o.ctxId);
  if (!(await podeGerir(actor, o.tipo, o.ctxId, d, "subir"))) throw new ForbiddenError();
  if (o.dados.length === 0) throw new DomainError("Arquivo vazio.");
  if (o.dados.length > MAX_BYTES) throw new DomainError("Arquivo grande demais.");
  const tipo = detectarTipo(o.dados);
  if (!tipo) throw new DomainError(`Tipo de arquivo não permitido. Envie ${EXTENSOES_ACEITAS}.`);
  if (o.dados.length > tipo.limiteMB * 1024 * 1024) throw new DomainError(`Limite de ${tipo.limiteMB} MB para este tipo de arquivo.`);
  if ((o.tipo === "album" || o.tipo === "documento") && tipo.categoria === "audio") throw new DomainError("Álbuns e documentos aceitam imagens e PDF.");
  if (o.tipo === "album" && tipo.categoria !== "imagem") throw new DomainError("Álbuns aceitam somente imagens.");
  if (tipo.categoria === "imagem" && (o.tipo === "album") && !o.autorizacaoImagem) {
    throw new DomainError("Confirme a autorização de uso de imagem (e dos responsáveis, no caso de menores) para enviar fotos.");
  }
  const n = await query<RowDataPacket>("SELECT COUNT(*) n FROM files WHERE ctx_tipo = ? AND ctx_id = ?", [o.tipo, o.ctxId]);
  if (Number(n[0].n) >= MAX_POR_CONTEXTO[o.tipo]) throw new DomainError("Limite de arquivos atingido neste local.");
  const sha = createHash("sha256").update(o.dados).digest("hex");
  const dup = await query<RowDataPacket>("SELECT id FROM files WHERE ctx_tipo = ? AND ctx_id = ? AND sha256 = ?", [o.tipo, o.ctxId, sha]);
  if (dup.length) throw new DomainError("Este arquivo já foi enviado aqui.");
  const nome = randomBytes(16).toString("hex");
  await disco.gravar(nome, o.dados);
  try {
    const r = await execute(
      "INSERT INTO files (arquivo, nome_original, mime, tamanho, sha256, ctx_tipo, ctx_id, descricao, autorizacao_imagem, criado_por) VALUES (?,?,?,?,?,?,?,?,?,?)",
      [nome, nomeSeguro(o.nome, tipo.ext), tipo.mime, o.dados.length, sha, o.tipo, o.ctxId, o.descricao?.trim().slice(0, 300) || null, o.autorizacaoImagem ? 1 : 0, actor]);
    await audit(actor, "arquivo.enviar", { entidade: "file", entidadeId: r.insertId, detalhes: { ctx: o.tipo, ctxId: o.ctxId, mime: tipo.mime, tamanho: o.dados.length } });
    return r.insertId;
  } catch (e) {
    await disco.remover(nome); // sem arquivos órfãos
    throw e;
  }
}

/** Autoriza e devolve o arquivo para leitura. Sempre 404 quando o usuário não enxerga o contexto. */
export async function abrirArquivo(actor: number, id: number) {
  const r = await query<Arquivo & RowDataPacket>("SELECT * FROM files WHERE id = ?", [id]);
  const a = r[0];
  if (!a) throw new NotFoundError();
  const d = await dono(actor, a.ctx_tipo, a.ctx_id);
  if (!(await disco.existe(a.arquivo))) throw new NotFoundError();
  return { arquivo: a, permitirDownload: d.permitirDownload };
}

export async function excluirArquivo(actor: number, id: number) {
  const r = await query<Arquivo & RowDataPacket>("SELECT * FROM files WHERE id = ?", [id]);
  const a = r[0];
  if (!a) throw new NotFoundError();
  const d = await dono(actor, a.ctx_tipo, a.ctx_id);
  if (!(await podeGerir(actor, a.ctx_tipo, a.ctx_id, d, "excluir", a.criado_por))) throw new ForbiddenError();
  await execute("DELETE FROM files WHERE id = ?", [id]);
  await disco.remover(a.arquivo);
  await audit(actor, "arquivo.excluir", { entidade: "file", entidadeId: id, detalhes: { ctx: a.ctx_tipo, ctxId: a.ctx_id, nome: a.nome_original } });
}

/* ---- Álbuns ---- */
export type Album = { id: number; unit_id: number | null; unit_nome: string | null; event_id: number | null; titulo: string; descricao: string | null; permitir_download: number; fotos: number; criado_em: Date };

export async function listarAlbuns(actor: number): Promise<Album[]> {
  const ids = await accessibleUnitIds(actor, "midia", "ver");
  const alvo = ids === "todas" ? "1=1" : ids.length ? "(a.unit_id IS NULL OR a.unit_id IN (?))" : "a.unit_id IS NULL";
  return query<Album & RowDataPacket>(
    `SELECT a.*, o.nome AS unit_nome, (SELECT COUNT(*) FROM files f WHERE f.ctx_tipo = 'album' AND f.ctx_id = a.id) AS fotos
     FROM albums a LEFT JOIN org_units o ON o.id = a.unit_id WHERE ${alvo} ORDER BY a.criado_em DESC, a.id DESC LIMIT 100`,
    ids !== "todas" && ids.length ? [ids] : []);
}

export async function getAlbum(actor: number, id: number) {
  const r = await query<Album & RowDataPacket>("SELECT a.*, o.nome AS unit_nome, 0 AS fotos FROM albums a LEFT JOIN org_units o ON o.id = a.unit_id WHERE a.id = ?", [id]);
  if (!r[0]) throw new NotFoundError();
  await dono(actor, "album", id); // 404 se não enxerga
  return r[0];
}

export async function criarAlbum(actor: number, d: z.infer<typeof albumSchema>) {
  await assertCan(actor, "midia", "criar", d.unitId);
  if (d.eventId != null) {
    const e = await query<RowDataPacket>("SELECT unit_id FROM events WHERE id = ?", [d.eventId]);
    if (!e[0]) throw new DomainError("Evento inexistente.");
    if (e[0].unit_id !== d.unitId && e[0].unit_id != null) throw new DomainError("O evento pertence a outra estrutura.");
  }
  const r = await execute("INSERT INTO albums (unit_id, event_id, titulo, descricao, permitir_download, criado_por) VALUES (?,?,?,?,?,?)",
    [d.unitId, d.eventId, d.titulo, d.descricao, d.permitirDownload ? 1 : 0, actor]);
  await audit(actor, "album.criar", { entidade: "album", entidadeId: r.insertId });
  return r.insertId;
}

export async function excluirAlbum(actor: number, id: number) {
  const a = await getAlbum(actor, id);
  await assertCan(actor, "midia", "excluir", a.unit_id);
  const arqs = await query<RowDataPacket>("SELECT arquivo FROM files WHERE ctx_tipo = 'album' AND ctx_id = ?", [id]);
  await execute("DELETE FROM files WHERE ctx_tipo = 'album' AND ctx_id = ?", [id]);
  await execute("DELETE FROM albums WHERE id = ?", [id]);
  for (const f of arqs) await disco.remover(f.arquivo as string);
  await audit(actor, "album.excluir", { entidade: "album", entidadeId: id, detalhes: { titulo: a.titulo, arquivos: arqs.length } });
}

export async function historicoAlbum(actor: number, id: number) {
  const a = await getAlbum(actor, id);
  await assertCan(actor, "midia", "editar", a.unit_id);
  return query<RowDataPacket & { acao: string; nome: string | null; detalhes: string | null; criado_em: Date }>(
    `SELECT l.acao, u.nome, l.detalhes, l.criado_em FROM audit_log l LEFT JOIN users u ON u.id = l.user_id
     WHERE (l.entidade = 'album' AND l.entidade_id = ?) OR (l.acao LIKE 'arquivo.%' AND l.detalhes LIKE ?)
     ORDER BY l.id DESC LIMIT 100`, [String(id), `%"ctx":"album","ctxId":${Number(id)},%`]);
}
