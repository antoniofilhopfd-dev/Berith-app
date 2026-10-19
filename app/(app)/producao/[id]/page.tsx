import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { exigir } from "@/lib/auth/pagina";
import { permissoesDe } from "@/lib/permissions";
import * as P from "@/lib/services/publicacoes";
import { NotFoundError } from "@/lib/services/errors";
import { opcoesProducao } from "@/lib/services/opcoes";
import { contasInstagram, nomesContas } from "@/lib/integracoes/contas";
import { EditorPublicacao } from "@/components/editor-publicacao";
import { ActionForm, Field, inputCls } from "@/components/action-form";
import { Badge, Card, Empty, PageHeader } from "@/components/ui";
import { FormatoTag, RedeTag, StatusBadge } from "@/components/pub-ui";
import { formatDateTime } from "@/lib/format";
import { paraInicial } from "@/lib/producao-ui";
import { utcToLocal } from "@/lib/time";
import { autosalvarAction, cancelarAction, comentarAction, criarModeloDaPublicacaoAction, duplicarAction, enviarRevisaoAction, excluirAction, iniciarProducaoAction, reabrirAction, resolverComentarioAction, salvarPublicacaoAction, salvarVersaoAction } from "../actions";
import { agendarAction, desagendarAction, reagendarAction } from "../../publicacoes/actions";

export const dynamic = "force-dynamic";

const ACAO_ROTULO: Record<string, string> = {
  criar: "Criou a publicação", editar: "Editou", status: "Mudou a situação", aprovar: "Aprovou", solicitar_ajustes: "Pediu ajustes", conteudo_alterado: "Conteúdo alterado",
  duplicar: "Duplicou", cancelar: "Cancelou", reabrir: "Reabriu", agendar: "Agendou", reagendar: "Reagendou", desagendar: "Cancelou o agendamento", data_planejada: "Mudou a data planejada",
  publicada_automatica: "Publicada automaticamente", publicada_assistida: "Publicada manualmente (assistida)", falha_publicacao: "Falha ao publicar", publicado: "Concluída: todas as redes publicadas",
  reprocessar: "Reprocessou", cancelar_rede: "Cancelou uma rede",
};

export default async function Producao({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ v1?: string; v2?: string }> }) {
  const user = await requireUser();
  await exigir(user.id, "producao", "ver");
  const pid = Number((await params).id);
  if (!Number.isInteger(pid) || pid <= 0) notFound();
  let det;
  try { det = await P.getPub(user.id, pid); } catch (e) { if (e instanceof NotFoundError) notFound(); throw e; }
  const sp = await searchParams;
  const { pub, redes, midias, podeEditar } = det;
  const [op, com, hist, apr, vers, perms, probs] = await Promise.all([
    opcoesProducao(user.id), P.comentarios(user.id, pid), P.historico(user.id, pid), P.historicoAprovacao(user.id, pid), P.versoes(user.id, pid), permissoesDe(user.id), P.problemas(pid),
  ]);
  const v1 = Number(sp.v1), v2 = sp.v2 ? Number(sp.v2) : null;
  const comparacao = Number.isInteger(v1) && v1 > 0 ? await P.compararVersoes(user.id, pid, v1, v2 && Number.isInteger(v2) ? v2 : null).catch(() => null) : null;
  const podeAprovar = perms.has("aprovacao:aprovar"), podeAgendar = perms.has("publicacao:criar"), podeExcluir = perms.has("producao:excluir");
  const editavel = podeEditar && pub.status !== "cancelado";
  const autosaveOk = editavel && ["rascunho", "em_producao", "ajustes_solicitados"].includes(pub.status);
  const publicar = pub.publicar_em ? utcToLocal(new Date(pub.publicar_em)) : null;
  const ajustesAbertos = com.filter((c) => c.tipo === "ajuste" && !c.resolvido_em);
  const ultimoAjuste = pub.status === "ajustes_solicitados" ? ajustesAbertos.at(-1) : null;

  return (
    <div className="space-y-6">
      <PageHeader titulo={pub.titulo} sub={`Criado por ${pub.criado_por_nome ?? "—"} em ${formatDateTime(pub.criado_em)} · versão ${pub.versao}`}>
        <StatusBadge status={pub.status} /><FormatoTag formato={pub.formato} />
        <span className="flex gap-1">{redes.map((r) => <RedeTag key={r.id} rede={r.rede} />)}</span>
      </PageHeader>

      <nav aria-label="Seções" className="flex flex-wrap gap-3 text-sm"><a href="#conteudo" className="underline">Conteúdo</a><a href="#fluxo" className="underline">Fluxo</a><a href="#comentarios" className="underline">Comentários ({com.length})</a><a href="#historico" className="underline">Histórico</a><a href="#versoes" className="underline">Versões ({vers.length})</a></nav>

      {ultimoAjuste && (
        <div role="alert" className="rounded-xl border border-cobre bg-amber-50 p-4 text-sm"><p className="font-medium">Ajustes solicitados por {ultimoAjuste.autor ?? "aprovador"}:</p><p className="mt-1 whitespace-pre-line">{ultimoAjuste.texto}</p></div>
      )}

      <section id="fluxo" aria-labelledby="h-fluxo" className="space-y-3">
        <h2 id="h-fluxo" className="sr-only">Fluxo de aprovação e publicação</h2>
        <Card title="Próximos passos">
          <div className="flex flex-wrap items-start gap-3">
            {editavel && ["rascunho"].includes(pub.status) && <ActionForm action={iniciarProducaoAction} submit="Iniciar produção" className="space-y-0"><input type="hidden" name="id" value={pid} /></ActionForm>}
            {editavel && ["rascunho", "em_producao", "ajustes_solicitados"].includes(pub.status) && (
              <div className="space-y-2">
                <ActionForm action={enviarRevisaoAction} submit="Enviar para revisão" className="space-y-0"><input type="hidden" name="id" value={pid} /></ActionForm>
                {probs.length > 0 && <ul className="list-disc pl-5 text-xs text-red-800">{probs.map((p) => <li key={p}>{p}</li>)}</ul>}
              </div>
            )}
            {pub.status === "em_revisao" && podeAprovar && <Link href={`/aprovacoes/${pid}`} className="inline-flex min-h-10 items-center rounded-lg bg-verde px-4 text-sm font-medium text-white">Revisar e decidir</Link>}
            {pub.status === "em_revisao" && editavel && <ActionForm action={iniciarProducaoAction} submit="Voltar para produção" className="space-y-0"><input type="hidden" name="id" value={pid} /></ActionForm>}
            {pub.status === "aprovado" && editavel && <ActionForm action={iniciarProducaoAction} submit="Reabrir edição" className="space-y-0"><input type="hidden" name="id" value={pid} /></ActionForm>}
            {pub.status === "publicado" && <Link href="/publicacoes" className="text-sm underline">Ver na fila de publicações</Link>}
            {pub.status === "cancelado" && editavel === false && podeEditar && <ActionForm action={reabrirAction} submit="Reabrir como rascunho" className="space-y-0"><input type="hidden" name="id" value={pid} /></ActionForm>}
          </div>
          {pub.status === "aprovado" && podeAgendar && (
            <div className="mt-4 border-t border-borda pt-4"><p className="mb-2 text-sm font-medium">Agendar publicação</p>
              <ActionForm action={agendarAction} submit="Agendar" className="flex flex-wrap items-end gap-2 space-y-0" resetOnOk={false}>
                <input type="hidden" name="id" value={pid} />
                <Field label="Data"><input name="data" type="date" required defaultValue={publicar?.date ?? ""} className={inputCls} /></Field>
                <Field label="Horário"><input name="hora" type="time" required defaultValue={publicar?.time ?? op.config.horariosSugeridos[0] ?? ""} className={inputCls} /></Field>
              </ActionForm>
              <p className="mt-2 text-xs text-tinta/60">Redes sem conta conectada ficam com a publicação assistida (você publica na rede e confirma aqui). Nada é marcado como publicado sem confirmação.</p>
            </div>
          )}
          {pub.status === "agendado" && (
            <div className="mt-4 space-y-3 border-t border-borda pt-4">
              <p className="text-sm">Agendado para <strong>{publicar ? `${publicar.date.split("-").reverse().join("/")} às ${publicar.time}` : "—"}</strong>.</p>
              {podeAgendar && (
                <div className="flex flex-wrap items-end gap-3">
                  <ActionForm action={reagendarAction} submit="Reagendar" className="flex flex-wrap items-end gap-2 space-y-0" resetOnOk={false}>
                    <input type="hidden" name="id" value={pid} />
                    <Field label="Nova data"><input name="data" type="date" required defaultValue={publicar?.date ?? ""} className={inputCls} /></Field>
                    <Field label="Horário"><input name="hora" type="time" required defaultValue={publicar?.time ?? ""} className={inputCls} /></Field>
                  </ActionForm>
                  <ActionForm action={desagendarAction} submit="Cancelar agendamento" danger className="space-y-0"><input type="hidden" name="id" value={pid} /></ActionForm>
                </div>
              )}
              <ul className="space-y-1 text-sm">{redes.map((r) => <li key={r.id} className="flex items-center gap-2"><RedeTag rede={r.rede} comNome /><Badge tom={r.envio === "publicada" ? "verde" : r.envio === "falhou" ? "vermelho" : "cinza"}>{r.envio}</Badge>{r.ultimo_erro && <span className="text-xs text-red-800">{r.ultimo_erro}</span>}</li>)}</ul>
            </div>
          )}
          {pub.status === "publicado" && <ul className="mt-3 space-y-1 text-sm">{redes.filter((r) => r.envio === "publicada").map((r) => <li key={r.id}><RedeTag rede={r.rede} comNome /> publicada em {formatDateTime(r.publicada_em)}{r.assistida ? " (publicação assistida)" : ""}{r.url_externa && <> · <a className="underline" href={r.url_externa} target="_blank" rel="noopener noreferrer">abrir na rede</a></>}</li>)}</ul>}
        </Card>
      </section>

      <section id="conteudo" aria-labelledby="h-conteudo">
        <h2 id="h-conteudo" className="sr-only">Conteúdo</h2>
        {!editavel && <p className="mb-3 rounded-lg bg-borda/40 p-3 text-sm">{pub.status === "publicado" ? "Publicação concluída: o conteúdo não pode mais ser alterado." : pub.status === "cancelado" ? "Publicação cancelada." : "Você pode visualizar esta publicação, mas não editá-la."}</p>}
        {pub.status === "aprovado" && editavel && <p className="mb-3 rounded-lg bg-amber-50 p-3 text-sm">Alterar legenda, hashtags, mídias, formato ou redes de um conteúdo aprovado cancela a aprovação e exige nova revisão.</p>}
        <EditorPublicacao inicial={paraInicial(pub, redes, midias)} campanhas={op.campanhas} editorias={op.editorias} pessoas={op.pessoas} conta={op.contaNome} contas={await nomesContas()} contasIg={await contasInstagram()} recentes={op.recentes}
          salvar={salvarPublicacaoAction} autosalvar={autosaveOk ? autosalvarAction : null} somenteLeitura={!editavel} hashtagsPadrao={op.config.hashtagsPadrao} />
      </section>

      <section id="comentarios" aria-labelledby="h-com">
        <Card title={`Comentários (${com.length})`}>
          <h2 id="h-com" className="sr-only">Comentários</h2>
          {com.length === 0 ? <Empty>Nenhum comentário ainda.</Empty> : (
            <ul className="space-y-3">
              {com.map((c) => (
                <li key={c.id} className={`rounded-lg border p-3 text-sm ${c.tipo === "ajuste" ? "border-cobre bg-amber-50" : "border-borda"}`}>
                  <p className="mb-1 flex flex-wrap items-center gap-2 text-xs text-tinta/70"><strong className="text-tinta">{c.autor ?? "Alguém"}</strong>{formatDateTime(c.criado_em)}{c.tipo === "ajuste" && <Badge tom="cobre">Ajuste solicitado</Badge>}{c.resolvido_em && <Badge tom="verde">Resolvido</Badge>}</p>
                  <p className="whitespace-pre-line">{c.texto}</p>
                  {c.tipo === "ajuste" && !c.resolvido_em && (podeEditar || podeAprovar) && <ActionForm action={resolverComentarioAction} submit="Marcar como resolvido" className="mt-2 space-y-0"><input type="hidden" name="comentarioId" value={c.id} /></ActionForm>}
                </li>
              ))}
            </ul>
          )}
          <ActionForm action={comentarAction} submit="Comentar" className="mt-4">
            <input type="hidden" name="id" value={pid} />
            <Field label="Novo comentário"><textarea name="texto" required rows={3} maxLength={3000} className={inputCls + " py-2"} /></Field>
          </ActionForm>
        </Card>
      </section>

      <section id="historico" aria-labelledby="h-hist" className="grid gap-4 lg:grid-cols-2">
        <Card title="Histórico de alterações">
          <h2 id="h-hist" className="sr-only">Histórico</h2>
          <ol className="space-y-2 text-sm">
            {hist.map((h) => (
              <li key={h.id} className="border-l-2 border-borda pl-3"><p><strong>{h.nome ?? "Sistema"}</strong> · {ACAO_ROTULO[h.acao] ?? h.acao}{h.para_status && h.de_status !== h.para_status ? ` → ${h.para_status}` : ""}</p>
                {h.detalhes && <p className="text-xs text-tinta/70">{h.detalhes}</p>}<p className="text-xs text-tinta/50">{formatDateTime(h.criado_em)}</p></li>
            ))}
          </ol>
        </Card>
        <Card title="Histórico de aprovação">
          {apr.length === 0 ? <Empty>Ainda não houve decisão.</Empty> : (
            <ol className="space-y-2 text-sm">{apr.map((a, i) => (
              <li key={i} className="border-l-2 border-borda pl-3"><p><Badge tom={a.decisao === "aprovado" ? "verde" : "cobre"}>{a.decisao === "aprovado" ? "Aprovado" : "Ajustes"}</Badge> · versão {a.versao} · <strong>{a.nome ?? "—"}</strong></p>
                {a.comentario && <p className="text-xs text-tinta/70">{a.comentario}</p>}<p className="text-xs text-tinta/50">{formatDateTime(a.criado_em)}</p></li>
            ))}</ol>
          )}
        </Card>
      </section>

      <section id="versoes" aria-labelledby="h-vers">
        <Card title="Controle de versões">
          <h2 id="h-vers" className="sr-only">Versões</h2>
          <ul className="mb-3 divide-y divide-borda text-sm">
            {vers.map((v) => (
              <li key={v.versao} className="flex flex-wrap items-center gap-2 py-2"><strong>Versão {v.versao}</strong><span className="text-tinta/70">{v.motivo ?? ""}</span><span className="text-xs text-tinta/50">{v.autor ?? "—"} · {formatDateTime(v.criado_em)}</span>
                <span className="ml-auto flex gap-3 text-xs"><Link href={`?v1=${v.versao}#versoes`} className="underline">Comparar com a atual</Link>{v.versao > 1 && <Link href={`?v1=${v.versao - 1}&v2=${v.versao}#versoes`} className="underline">Comparar com a anterior</Link>}</span></li>
            ))}
          </ul>
          {comparacao && (
            <div className="space-y-3 rounded-lg border border-borda p-3 text-sm">
              <p className="font-medium">Comparando versão {v1} com {v2 ? `a versão ${v2}` : "o conteúdo atual"}</p>
              {comparacao.filter((c) => c.mudou).length === 0 && <p className="text-tinta/70">Nenhuma diferença.</p>}
              {comparacao.filter((c) => c.mudou).map((c) => (
                <div key={c.campo}><p className="text-xs font-semibold uppercase text-tinta/60">{c.rotulo}</p>
                  <p className="whitespace-pre-wrap break-words">{c.trechos.map((t, i) => t.tipo === "igual" ? <span key={i}>{t.texto}</span> : t.tipo === "removido" ? <del key={i} className="bg-red-100 text-red-900">{t.texto}</del> : <ins key={i} className="bg-green-100 text-green-900 no-underline">{t.texto}</ins>)}</p></div>
              ))}
            </div>
          )}
          {editavel && <ActionForm action={salvarVersaoAction} submit="Salvar versão agora" className="mt-3 flex flex-wrap items-end gap-2 space-y-0"><input type="hidden" name="id" value={pid} /><Field label="Motivo (opcional)"><input name="motivo" maxLength={200} className={inputCls} /></Field></ActionForm>}
        </Card>
      </section>

      <Card title="Outras ações">
        <div className="flex flex-wrap items-start gap-3">
          {perms.has("producao:criar") && <ActionForm action={duplicarAction} submit="Duplicar conteúdo" className="space-y-0"><input type="hidden" name="id" value={pid} /></ActionForm>}
          {perms.has("producao:criar") && <ActionForm action={criarModeloDaPublicacaoAction} submit="Salvar como modelo" className="flex items-end gap-2 space-y-0"><input type="hidden" name="id" value={pid} /><Field label="Nome do modelo"><input name="nome" required maxLength={120} className={inputCls} /></Field></ActionForm>}
          {editavel && !["publicado", "cancelado"].includes(pub.status) && <ActionForm action={cancelarAction} submit="Cancelar publicação" danger className="flex items-end gap-2 space-y-0"><input type="hidden" name="id" value={pid} /><Field label="Motivo"><input name="motivo" maxLength={300} className={inputCls} /></Field></ActionForm>}
          {podeExcluir && ["rascunho", "cancelado"].includes(pub.status) && <ActionForm action={excluirAction} submit="Excluir definitivamente" danger className="space-y-0"><input type="hidden" name="id" value={pid} /></ActionForm>}
        </div>
      </Card>
    </div>
  );
}
