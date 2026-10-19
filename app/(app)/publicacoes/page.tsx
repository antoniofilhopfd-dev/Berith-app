import Link from "next/link";
import { contaParaFiltro } from "@/lib/auth/conta";
import { requireUser } from "@/lib/auth/session";
import { exigir } from "@/lib/auth/pagina";
import { permissoesDe } from "@/lib/permissions";
import * as A from "@/lib/services/agendamento";
import * as P from "@/lib/services/publicacoes";
import { statusRedes } from "@/lib/integracoes/contas";
import { ActionForm } from "@/components/action-form";
import { Badge, Card, Empty, PageHeader, Tabs } from "@/components/ui";
import { FormatoTag, RedeTag } from "@/components/pub-ui";
import { formatDateTime } from "@/lib/format";
import { cancelarRedeAction, reprocessarAction } from "./actions";

export const metadata = { title: "Publicações" };
export const dynamic = "force-dynamic";

const ENVIO_ROTULO: Record<string, { r: string; tom: "verde" | "vermelho" | "amarelo" | "cinza" | "azul" }> = {
  pendente: { r: "Pendente", tom: "cinza" }, agendada: { r: "Agendada", tom: "azul" }, publicando: { r: "Publicando…", tom: "amarelo" }, publicada: { r: "Publicada", tom: "verde" }, falhou: { r: "Falhou", tom: "vermelho" }, cancelada: { r: "Cancelada", tom: "cinza" },
};

export default async function Publicacoes({ searchParams }: { searchParams: Promise<{ aba?: string }> }) {
  const user = await requireUser();
  await exigir(user.id, "publicacao", "ver");
  const sp = await searchParams;
  const aba = ["fila", "falhas", "historico"].includes(sp.aba ?? "") ? sp.aba! : "fila";
  const perms = await permissoesDe(user.id);
  const podeEditar = perms.has("publicacao:editar"), podePublicar = perms.has("publicacao:criar");
  const contaId = await contaParaFiltro();
  const [fila, falhas, hist, prontos, redes] = await Promise.all([
    A.fila(user.id, { contaId, envio: ["agendada", "publicando"] }),
    A.fila(user.id, { contaId, envio: ["falhou"] }),
    A.fila(user.id, { contaId, envio: ["publicada", "cancelada"], limite: 100 }),
    P.listar(user.id, { contaId, status: ["aprovado"], limite: 50 }),
    perms.has("integracoes:ver") ? statusRedes(user.id) : Promise.resolve(null),
  ]);
  const abas = [
    { chave: "fila", rotulo: `Fila (${fila.length})`, href: "?aba=fila" }, { chave: "falhas", rotulo: `Falhas (${falhas.length})`, href: "?aba=falhas" }, { chave: "historico", rotulo: "Histórico", href: "?aba=historico" },
  ];
  const tent = aba === "falhas" ? new Map(await Promise.all(falhas.slice(0, 30).map(async (f) => [f.id, await A.tentativas(user.id, f.id)] as const))) : new Map();

  const Linha = ({ f, assistida = true }: { f: (typeof fila)[number]; assistida?: boolean }) => (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-2 py-3 text-sm">
      <RedeTag rede={f.rede} comNome /><Link href={`/producao/${f.publicacao_id}`} className="font-medium text-verde-escuro hover:underline">{f.titulo}</Link><FormatoTag formato={f.formato} />
      <Badge tom={ENVIO_ROTULO[f.envio].tom}>{ENVIO_ROTULO[f.envio].r}</Badge>
      {f.agendada_para && f.envio !== "publicada" && <span className="text-xs text-tinta/70">{formatDateTime(f.agendada_para)}</span>}
      {f.publicada_em && <span className="text-xs text-tinta/70">{formatDateTime(f.publicada_em)}{f.assistida ? " · assistida" : " · automática"}</span>}
      {f.url_externa && <a href={f.url_externa} target="_blank" rel="noopener noreferrer" className="text-xs underline">abrir na rede</a>}
      {f.tentativas > 0 && f.envio !== "publicada" && <span className="text-xs text-tinta/60">{f.tentativas} tentativa(s)</span>}
      {f.ultimo_erro && <span className="basis-full rounded bg-red-50 px-2 py-1 text-xs text-red-900">{f.ultimo_erro}</span>}
      {(f.envio === "agendada" || f.envio === "falhou") && (
        <span className="flex flex-wrap gap-2">
          {assistida && podePublicar && <Link href={`/publicacoes/assistida/${f.id}`} className="inline-flex min-h-10 items-center rounded-lg border border-borda px-3 text-sm hover:bg-fundo">Publicação assistida</Link>}
          {f.envio === "falhou" && podeEditar && <ActionForm action={reprocessarAction} submit="Reprocessar" className="space-y-0"><input type="hidden" name="redeId" value={f.id} /></ActionForm>}
          {podeEditar && <ActionForm action={cancelarRedeAction} submit="Cancelar esta rede" danger className="space-y-0"><input type="hidden" name="redeId" value={f.id} /></ActionForm>}
        </span>
      )}
    </li>
  );

  return (
    <div>
      <PageHeader titulo="Publicações" sub="Fila de agendamento, falhas e histórico. A publicação automática só ocorre em redes com conta conectada; nas demais, use a publicação assistida." />
      {redes && redes.some((r) => r.estado !== "conectada") && (
        <p className="mb-4 rounded-lg bg-amber-50 p-3 text-sm">Redes sem conexão automática: {redes.filter((r) => r.estado !== "conectada").map((r) => `${r.rede} (${r.estado.replace(/_/g, " ")})`).join(", ")}. {perms.has("integracoes:gerir") ? <Link className="underline" href="/configuracoes/redes">Gerenciar conexões</Link> : "Peça a um administrador para conectá-las."}</p>
      )}
      <Tabs itens={abas} ativo={aba} />
      {aba === "fila" && (
        <div className="space-y-5">
          {prontos.length > 0 && podePublicar && (
            <Card title={`Aprovados, prontos para agendar (${prontos.length})`}>
              <ul className="divide-y divide-borda text-sm">{prontos.map((p) => <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2"><Link href={`/producao/${p.id}#fluxo`} className="font-medium hover:underline">{p.titulo}</Link><span className="text-xs text-tinta/60">{p.publicar_em ? `previsto ${formatDateTime(p.publicar_em)}` : "sem data"} · <Link className="underline" href={`/producao/${p.id}#fluxo`}>agendar</Link></span></li>)}</ul>
            </Card>
          )}
          <Card title="Na fila">{fila.length === 0 ? <Empty>Nada agendado no momento.</Empty> : <ul className="divide-y divide-borda">{fila.map((f) => <Linha key={f.id} f={f} />)}</ul>}</Card>
        </div>
      )}
      {aba === "falhas" && (
        <Card title="Publicações com falha">
          {falhas.length === 0 ? <Empty>Nenhuma falha. 🙌</Empty> : (
            <ul className="divide-y divide-borda">{falhas.map((f) => (
              <div key={f.id}><Linha f={f} />
                {(tent.get(f.id) ?? []).length > 0 && <details className="pb-3 pl-2 text-xs"><summary className="cursor-pointer text-tinta/70">Histórico de tentativas</summary>
                  <ul className="mt-1 space-y-1">{tent.get(f.id)!.map((t: { id: number; iniciada_em: Date; resultado: string; http_status: number | null; erro: string | null }) => <li key={t.id}>{formatDateTime(t.iniciada_em)} · {t.resultado}{t.http_status ? ` (HTTP ${t.http_status})` : ""}{t.erro ? ` · ${t.erro}` : ""}</li>)}</ul></details>}
              </div>
            ))}</ul>
          )}
          <p className="mt-3 text-xs text-tinta/60">“Reprocessar” tenta publicar de novo apenas a rede que falhou. Se o erro disser que o resultado é incerto, confira na rede social antes, para não duplicar a postagem.</p>
        </Card>
      )}
      {aba === "historico" && <Card title="Publicadas e canceladas">{hist.length === 0 ? <Empty>Sem registros.</Empty> : <ul className="divide-y divide-borda">{hist.map((f) => <Linha key={f.id} f={f} assistida={false} />)}</ul>}</Card>}
    </div>
  );
}
