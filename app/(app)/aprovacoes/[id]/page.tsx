import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { exigir } from "@/lib/auth/pagina";
import { permissoesDe } from "@/lib/permissions";
import * as P from "@/lib/services/publicacoes";
import { NotFoundError } from "@/lib/services/errors";
import { opcoesProducao } from "@/lib/services/opcoes";
import { ActionForm, Field, inputCls } from "@/components/action-form";
import { Badge, Card, Empty, PageHeader } from "@/components/ui";
import { FormatoTag, RedeTag, StatusBadge } from "@/components/pub-ui";
import { Previa } from "@/components/previas";
import { REDE_ROTULO, textoDaRede } from "@/lib/editorial";
import { formatDateTime } from "@/lib/format";
import { decidirAction } from "../actions";
import { comentarAction } from "../../producao/actions";

export const dynamic = "force-dynamic";

export default async function Revisar({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  await exigir(user.id, "aprovacao", "ver");
  const pid = Number((await params).id);
  if (!Number.isInteger(pid) || pid <= 0) notFound();
  let det;
  try { det = await P.getPub(user.id, pid); } catch (e) { if (e instanceof NotFoundError) notFound(); throw e; }
  const { pub, redes, midias } = det;
  const [op, com, apr, perms, probs] = await Promise.all([opcoesProducao(user.id), P.comentarios(user.id, pid), P.historicoAprovacao(user.id, pid), permissoesDe(user.id), P.problemas(pid)]);
  const emRevisao = pub.status === "em_revisao";
  const podeDecidir = emRevisao && perms.has("aprovacao:aprovar");
  const midiasPrev = midias.map((m) => ({ id: m.id, tipo: m.tipo, nome: m.nome_original }));
  return (
    <div className="space-y-5">
      <PageHeader titulo={pub.titulo} sub={`Responsável: ${pub.responsavel_nome ?? "—"} · versão ${pub.versao}`}>
        <StatusBadge status={pub.status} /><FormatoTag formato={pub.formato} /><Link href={`/producao/${pid}`} className="text-sm underline">Abrir produção</Link>
      </PageHeader>
      {!emRevisao && <p className="rounded-lg bg-borda/40 p-3 text-sm">Esta publicação não está em revisão (situação atual: {pub.status}).</p>}
      {pub.objetivo && <Card title="Objetivo"><p className="text-sm">{pub.objetivo}</p></Card>}
      <div className="grid gap-5 lg:grid-cols-[1fr_minmax(0,360px)]">
        <div className="space-y-4">
          {redes.map((r) => {
            const texto = textoDaRede({ legenda: pub.legenda, hashtags: pub.hashtags }, { legenda: r.legenda, hashtags: r.hashtags });
            return (
              <Card key={r.id} title={REDE_ROTULO[r.rede]}>
                {r.titulo_externo && <p className="mb-1 text-sm"><strong>Título:</strong> {r.titulo_externo}</p>}
                <p className="whitespace-pre-line rounded bg-fundo p-3 text-sm">{texto || "(sem legenda)"}</p>
              </Card>
            );
          })}
          <Card title={`Mídias (${midias.length})`}>
            {midias.length === 0 ? <Empty>Sem mídia.</Empty> : <ol className="grid grid-cols-2 gap-3 sm:grid-cols-3">{midias.map((m, i) => (
              <li key={m.id} className="text-xs"><div className="aspect-square overflow-hidden rounded bg-borda/50">
                {m.tipo === "imagem"
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={`/api/midias/${m.id}`} alt={m.nome_original} className="h-full w-full object-cover" />
                  : <video src={`/api/midias/${m.id}`} controls preload="metadata" className="h-full w-full object-cover" aria-label={m.nome_original} />}
              </div><p className="mt-1 truncate">{i + 1}. {m.nome_original}</p></li>
            ))}</ol>}
          </Card>
          {pub.referencias && <Card title="Referências"><p className="whitespace-pre-line text-sm">{pub.referencias}</p></Card>}
          {probs.length > 0 && <Card title="Atenção"><ul className="list-disc pl-5 text-sm text-red-800">{probs.map((p) => <li key={p}>{p}</li>)}</ul></Card>}
        </div>
        <aside className="space-y-4" aria-label="Pré-visualização">
          {redes.slice(0, 2).map((r) => (
            <div key={r.id}><p className="mb-1 flex items-center gap-2 text-sm"><RedeTag rede={r.rede} comNome /></p>
              <Previa rede={r.rede} d={{ conta: op.contaNome, formato: pub.formato, titulo: r.titulo_externo || pub.titulo, midias: midiasPrev, texto: textoDaRede({ legenda: pub.legenda, hashtags: pub.hashtags }, { legenda: r.legenda, hashtags: r.hashtags }) }} /></div>
          ))}
        </aside>
      </div>

      {podeDecidir && (
        <Card title="Sua decisão">
          <div className="grid gap-4 md:grid-cols-2">
            <ActionForm action={decidirAction} submit="Aprovar conteúdo">
              <input type="hidden" name="id" value={pid} /><input type="hidden" name="decisao" value="aprovado" />
              <Field label="Comentário (opcional)"><textarea name="comentario" rows={3} maxLength={3000} className={inputCls + " py-2"} /></Field>
            </ActionForm>
            <ActionForm action={decidirAction} submit="Solicitar ajustes" danger>
              <input type="hidden" name="id" value={pid} /><input type="hidden" name="decisao" value="ajustes" />
              <Field label="O que precisa mudar? (obrigatório)"><textarea name="comentario" required rows={3} maxLength={3000} className={inputCls + " py-2"} /></Field>
            </ActionForm>
          </div>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Comentários">
          {com.length === 0 ? <Empty>Nenhum comentário.</Empty> : <ul className="space-y-2 text-sm">{com.map((c) => <li key={c.id} className="rounded border border-borda p-2"><p className="text-xs text-tinta/60"><strong className="text-tinta">{c.autor ?? "—"}</strong> · {formatDateTime(c.criado_em)} {c.tipo === "ajuste" && <Badge tom="cobre">Ajuste</Badge>}</p><p className="whitespace-pre-line">{c.texto}</p></li>)}</ul>}
          <ActionForm action={comentarAction} submit="Comentar" className="mt-3"><input type="hidden" name="id" value={pid} /><Field label="Novo comentário"><textarea name="texto" required rows={2} maxLength={3000} className={inputCls + " py-2"} /></Field></ActionForm>
        </Card>
        <Card title="Decisões anteriores">
          {apr.length === 0 ? <Empty>Sem decisões anteriores.</Empty> : <ul className="space-y-2 text-sm">{apr.map((a, i) => <li key={i}><Badge tom={a.decisao === "aprovado" ? "verde" : "cobre"}>{a.decisao === "aprovado" ? "Aprovado" : "Ajustes"}</Badge> v{a.versao} · {a.nome ?? "—"} · {formatDateTime(a.criado_em)}{a.comentario && <p className="text-xs text-tinta/70">{a.comentario}</p>}</li>)}</ul>}
        </Card>
      </div>
    </div>
  );
}
