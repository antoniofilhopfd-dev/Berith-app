import type { RowDataPacket } from "mysql2/promise";
import { execute, query } from "@/lib/db";
import { assertCan } from "@/lib/permissions";
import { addDays, todayLocal } from "@/lib/time";
import { buscarJson, itensDoJson, montarUrl, type Buscador, type ItemExtraido, type Mapeamento } from "@/lib/liturgia/importador";
import type { ProvedorInput } from "@/lib/validation/liturgia";
import { DomainError } from "./errors";
import { audit } from "./audit";

export type Provedor = {
  ativo: number; fonte_nome: string; fonte_url_publica: string | null; url_template: string; mapeamento: string; copiar_texto: number;
  direitos_confirmados: number; dias_a_frente: number; ultima_execucao: Date | null; ultimo_status: string | null; configurado_por: number;
};
const INTERVALO_MS = 6 * 3600_000;

export async function getProvedor(actor: number): Promise<Provedor | null> {
  await assertCan(actor, "conteudos", "editar", null);
  return (await query<Provedor & RowDataPacket>("SELECT * FROM liturgia_provedor WHERE id = 1"))[0] ?? null;
}

export async function salvarProvedor(actor: number, d: ProvedorInput) {
  await assertCan(actor, "conteudos", "editar", null);
  await execute(
    `INSERT INTO liturgia_provedor (id, ativo, fonte_nome, fonte_url_publica, url_template, mapeamento, copiar_texto, direitos_confirmados, dias_a_frente, configurado_por)
     VALUES (1,?,?,?,?,?,?,?,?,?)
     ON DUPLICATE KEY UPDATE ativo=VALUES(ativo), fonte_nome=VALUES(fonte_nome), fonte_url_publica=VALUES(fonte_url_publica), url_template=VALUES(url_template),
       mapeamento=VALUES(mapeamento), copiar_texto=VALUES(copiar_texto), direitos_confirmados=VALUES(direitos_confirmados), dias_a_frente=VALUES(dias_a_frente), configurado_por=VALUES(configurado_por)`,
    [d.ativo ? 1 : 0, d.fonteNome, d.fonteUrlPublica ?? null, d.urlTemplate, JSON.stringify(d.mapeamento), d.copiarTexto ? 1 : 0, d.direitosConfirmados ? 1 : 0, d.diasAFrente, actor]);
  await audit(actor, "liturgia.provedor_salvar", { entidade: "liturgia_provedor", entidadeId: 1, detalhes: { ativo: d.ativo, fonte: d.fonteNome, copiarTexto: d.copiarTexto, direitos: d.direitosConfirmados, host: new URL(d.urlTemplate.replace(/\{[a-z]+\}/g, "x")).hostname } });
}

/** Prévia: busca e extrai SEM gravar nada. Permite validar fonte e mapeamento antes de ativar. */
export async function testarProvedor(actor: number, d: ProvedorInput, data = todayLocal(), buscador: Buscador = buscarJson): Promise<{ url: string; itens: ItemExtraido[] }> {
  await assertCan(actor, "conteudos", "editar", null);
  const url = montarUrl(d.urlTemplate, data);
  try {
    const json = await buscador(url);
    const itens = itensDoJson(json, d.mapeamento as Mapeamento, d.copiarTexto);
    if (itens.length === 0) throw new DomainError("A fonte respondeu, mas nenhum campo do mapeamento foi encontrado. Revise os caminhos.");
    return { url, itens };
  } catch (e) {
    if (e instanceof DomainError) throw e;
    throw new DomainError(e instanceof Error ? e.message : "Falha ao consultar a fonte.");
  }
}

export type ResultadoImportacao = { executado: boolean; motivo?: string; criados: number; atualizados: number; preservados: number; erros: string[] };

/**
 * Importa hoje + N dias. Só cria/atualiza itens que a própria importação criou; itens cadastrados à mão são preservados.
 * Chamada pelo agendador (limitada a 1x a cada 6 h) ou manualmente (forçar).
 */
export async function importar(opcoes: { forcar?: boolean; agora?: Date; buscador?: Buscador } = {}): Promise<ResultadoImportacao> {
  const vazio: ResultadoImportacao = { executado: false, criados: 0, atualizados: 0, preservados: 0, erros: [] };
  const [p] = await query<Provedor & RowDataPacket>("SELECT * FROM liturgia_provedor WHERE id = 1");
  if (!p || !p.ativo) return { ...vazio, motivo: "Importação desativada." };
  const agora = opcoes.agora ?? new Date();
  if (!opcoes.forcar && p.ultima_execucao && agora.getTime() - new Date(p.ultima_execucao).getTime() < INTERVALO_MS) return { ...vazio, motivo: "Executada há menos de 6 horas." };
  const buscador = opcoes.buscador ?? buscarJson;
  const mapa = JSON.parse(p.mapeamento) as Mapeamento;
  const copiar = Boolean(p.copiar_texto) && Boolean(p.direitos_confirmados); // nunca copia texto sem a confirmação de direitos
  const r: ResultadoImportacao = { executado: true, criados: 0, atualizados: 0, preservados: 0, erros: [] };
  const hoje = todayLocal();
  for (let i = 0; i <= p.dias_a_frente; i++) {
    const data = addDays(hoje, i);
    try {
      const itens = itensDoJson(await buscador(montarUrl(p.url_template, data)), mapa, copiar);
      for (const it of itens) {
        const [ex] = await query<RowDataPacket & { id: number; importado: number | null }>(
          "SELECT i.id, m.item_id AS importado FROM liturgia_itens i LEFT JOIN liturgia_importados m ON m.item_id = i.id WHERE i.data = ? AND i.tipo = ?", [data, it.tipo]);
        if (!ex) {
          const ins = await execute("INSERT INTO liturgia_itens (data, tipo, titulo, texto, fonte_nome, fonte_url, direitos, criado_por) VALUES (?,?,?,?,?,?,?,?)",
            [data, it.tipo, it.titulo, it.texto, p.fonte_nome, p.fonte_url_publica, copiar ? "Reprodução autorizada (confirmada pela comunidade)" : "Apenas referência; texto na fonte", p.configurado_por]);
          await execute("INSERT INTO liturgia_importados (item_id) VALUES (?)", [ins.insertId]); r.criados++;
        } else if (ex.importado != null) {
          await execute("UPDATE liturgia_itens SET titulo=?, texto=?, fonte_nome=?, fonte_url=?, direitos=? WHERE id=?",
            [it.titulo, it.texto, p.fonte_nome, p.fonte_url_publica, copiar ? "Reprodução autorizada (confirmada pela comunidade)" : "Apenas referência; texto na fonte", ex.id]);
          await execute("UPDATE liturgia_importados SET importado_em = UTC_TIMESTAMP() WHERE item_id = ?", [ex.id]); r.atualizados++;
        } else r.preservados++; // cadastrado manualmente: não sobrescreve
      }
    } catch (e) { r.erros.push(`${data}: ${e instanceof Error ? e.message : "erro"}`.slice(0, 200)); }
  }
  const status = r.erros.length ? `Concluída com ${r.erros.length} erro(s): ${r.erros[0]}` : `OK: ${r.criados} novo(s), ${r.atualizados} atualizado(s), ${r.preservados} preservado(s)`;
  await execute("UPDATE liturgia_provedor SET ultima_execucao = UTC_TIMESTAMP(), ultimo_status = ? WHERE id = 1", [status.slice(0, 300)]);
  await execute("INSERT INTO audit_log (user_id, acao, entidade, detalhes) VALUES (NULL, 'liturgia.importar', 'liturgia_provedor', ?)", [JSON.stringify({ criados: r.criados, atualizados: r.atualizados, preservados: r.preservados, erros: r.erros.length })]);
  return r;
}

export async function importarAgora(actor: number, buscador?: Buscador) {
  await assertCan(actor, "conteudos", "editar", null);
  return importar({ forcar: true, buscador });
}
