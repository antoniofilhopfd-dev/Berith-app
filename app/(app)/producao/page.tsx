import Link from "next/link";
import { requireUser } from "@/lib/auth/session";
import { exigir } from "@/lib/auth/pagina";
import { permissoesDe } from "@/lib/permissions";
import * as P from "@/lib/services/publicacoes";
import { opcoesProducao } from "@/lib/services/opcoes";
import { Card, Empty, LinkButton, PageHeader, btnSec } from "@/components/ui";
import { ActionForm } from "@/components/action-form";
import { FormatoTag, PrioridadeTag, RedesTags, StatusBadge } from "@/components/pub-ui";
import { REDES, STATUS, STATUS_ROTULO, type Rede, type Status } from "@/lib/editorial";
import { formatDateTime } from "@/lib/format";
import { agoraMs } from "@/lib/time";
import { enviarRevisaoAction, iniciarProducaoAction } from "./actions";

export const metadata = { title: "Produção" };
export const dynamic = "force-dynamic";

const COLUNAS: Status[] = ["rascunho", "em_producao", "em_revisao", "ajustes_solicitados", "aprovado", "agendado", "publicado"];

export default async function ProducaoLista({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireUser();
  await exigir(user.id, "producao", "ver");
  const sp = await searchParams;
  const visao = sp.v === "lista" ? "lista" : "kanban";
  const status = STATUS.includes(sp.status as Status) ? (sp.status as Status) : undefined;
  const rede = REDES.includes(sp.rede as Rede) ? (sp.rede as Rede) : undefined;
  const num = (v?: string) => (v && Number.isInteger(Number(v)) && Number(v) > 0 ? Number(v) : undefined);
  const [op, perms] = await Promise.all([opcoesProducao(user.id), permissoesDe(user.id)]);
  const lista = await P.listar(user.id, {
    status: status ? [status] : visao === "kanban" ? COLUNAS : undefined, rede, responsavelId: num(sp.resp), campanhaId: num(sp.camp), editoriaId: num(sp.edit),
    q: sp.q?.trim().slice(0, 80) || undefined, minhas: sp.minhas === "1" ? user.id : undefined, limite: 400,
  });
  const agora = agoraMs();
  const filtros = new URLSearchParams(Object.entries(sp).filter(([k, v]) => v && k !== "v") as [string, string][]);
  const link = (v: string) => `?${new URLSearchParams([...filtros.entries(), ["v", v]]).toString()}`;

  const cartao = (p: (typeof lista)[number]) => {
    const atrasado = p.prazo && new Date(p.prazo).getTime() < agora && ["rascunho", "em_producao", "ajustes_solicitados"].includes(p.status);
    return (
      <li key={p.id} className="rounded-lg border border-borda bg-white p-3 text-sm shadow-sm" style={p.campanha_cor ? { borderLeft: `4px solid ${p.campanha_cor}` } : undefined}>
        <Link href={`/producao/${p.id}`} className="font-medium text-verde-escuro hover:underline">{p.titulo}</Link>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1"><FormatoTag formato={p.formato} /><RedesTags redes={p.redes} />{p.prioridade === "alta" && <PrioridadeTag p="alta" />}</div>
        <p className="mt-1 text-xs text-tinta/70">{p.responsavel_nome ?? "Sem responsável"}</p>
        {p.prazo && <p className={`text-xs ${atrasado ? "font-semibold text-red-700" : "text-tinta/60"}`}>{atrasado ? "Atrasado · " : "Prazo "}{formatDateTime(p.prazo)}</p>}
        {p.publicar_em && <p className="text-xs text-tinta/60">Publicar {formatDateTime(p.publicar_em)}</p>}
        {perms.has("producao:editar") && p.status === "rascunho" && <ActionForm action={iniciarProducaoAction} submit="Iniciar produção" className="mt-2 space-y-0"><input type="hidden" name="id" value={p.id} /></ActionForm>}
        {perms.has("producao:editar") && (p.status === "em_producao" || p.status === "ajustes_solicitados") && (p.criado_por === user.id || p.responsavel_id === user.id || perms.has("producao:excluir")) && <ActionForm action={enviarRevisaoAction} submit="Enviar para revisão" className="mt-2 space-y-0"><input type="hidden" name="id" value={p.id} /></ActionForm>}
      </li>
    );
  };

  return (
    <div>
      <PageHeader titulo="Produção" sub="Do rascunho à publicação, em um só lugar.">
        {perms.has("producao:criar") && <LinkButton href="/producao/nova">Nova produção</LinkButton>}
        <Link href="/producao/modelos" className={btnSec}>Modelos</Link>
        <span className="inline-flex overflow-hidden rounded-lg border border-borda" role="group" aria-label="Visualização">
          <Link href={link("kanban")} aria-current={visao === "kanban" ? "true" : undefined} className={`flex min-h-10 items-center px-3 text-sm ${visao === "kanban" ? "bg-verde text-white" : "bg-white"}`}>Kanban</Link>
          <Link href={link("lista")} aria-current={visao === "lista" ? "true" : undefined} className={`flex min-h-10 items-center px-3 text-sm ${visao === "lista" ? "bg-verde text-white" : "bg-white"}`}>Lista</Link>
        </span>
      </PageHeader>

      <form method="get" className="mb-5 grid gap-2 rounded-xl border border-borda bg-cartao p-3 sm:grid-cols-3 lg:grid-cols-6" aria-label="Filtros">
        <input type="hidden" name="v" value={visao} />
        <input name="q" type="search" defaultValue={sp.q ?? ""} placeholder="Buscar título ou legenda" aria-label="Buscar" className="min-h-10 rounded-lg border border-borda px-3 text-sm lg:col-span-2" />
        <select name="rede" defaultValue={sp.rede ?? ""} aria-label="Rede social" className="min-h-10 rounded-lg border border-borda px-2 text-sm"><option value="">Todas as redes</option>{REDES.map((r) => <option key={r} value={r}>{r[0].toUpperCase() + r.slice(1)}</option>)}</select>
        <select name="resp" defaultValue={sp.resp ?? ""} aria-label="Responsável" className="min-h-10 rounded-lg border border-borda px-2 text-sm"><option value="">Todos os responsáveis</option>{op.pessoas.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}</select>
        <select name="camp" defaultValue={sp.camp ?? ""} aria-label="Campanha" className="min-h-10 rounded-lg border border-borda px-2 text-sm"><option value="">Todas as campanhas</option>{op.campanhas.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}</select>
        <select name="edit" defaultValue={sp.edit ?? ""} aria-label="Editoria" className="min-h-10 rounded-lg border border-borda px-2 text-sm"><option value="">Todas as editorias</option>{op.editorias.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}</select>
        {visao === "lista" && <select name="status" defaultValue={sp.status ?? ""} aria-label="Situação" className="min-h-10 rounded-lg border border-borda px-2 text-sm"><option value="">Todas as situações</option>{STATUS.map((s) => <option key={s} value={s}>{STATUS_ROTULO[s]}</option>)}</select>}
        <label className="flex min-h-10 items-center gap-2 text-sm"><input type="checkbox" name="minhas" value="1" defaultChecked={sp.minhas === "1"} className="h-4 w-4" /> Só as minhas</label>
        <button className="min-h-10 rounded-lg bg-verde px-4 text-sm text-white">Filtrar</button>
        {Object.keys(sp).some((k) => k !== "v" && sp[k]) && <Link href={`?v=${visao}`} className="flex min-h-10 items-center text-sm underline">Limpar filtros</Link>}
      </form>

      {visao === "kanban" ? (
        <div className="-mx-4 overflow-x-auto px-4 pb-4 [contain:paint] lg:mx-0 lg:px-0">
          <div className="flex gap-3" style={{ minWidth: COLUNAS.length * 270 }}>
            {COLUNAS.map((c) => {
              const itens = lista.filter((p) => p.status === c);
              return (
                <section key={c} aria-labelledby={`col-${c}`} className="w-[260px] shrink-0 rounded-xl bg-borda/30 p-2">
                  <h2 id={`col-${c}`} className="mb-2 flex items-center justify-between px-1 text-xs font-semibold uppercase tracking-wide text-tinta/70">{STATUS_ROTULO[c]}<span className="rounded-full bg-white px-2 py-0.5 text-tinta">{itens.length}</span></h2>
                  {itens.length === 0 ? <p className="p-3 text-center text-xs text-tinta/50">Vazio</p> : <ul className="space-y-2">{itens.map(cartao)}</ul>}
                </section>
              );
            })}
          </div>
        </div>
      ) : lista.length === 0 ? (
        <Empty>Nenhuma produção encontrada com estes filtros.</Empty>
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full min-w-[720px] text-left text-sm">
            <caption className="sr-only">Lista de produções</caption>
            <thead className="border-b border-borda text-xs uppercase text-tinta/60"><tr><th scope="col" className="p-3">Título</th><th scope="col" className="p-3">Situação</th><th scope="col" className="p-3">Redes</th><th scope="col" className="p-3">Responsável</th><th scope="col" className="p-3">Prazo</th><th scope="col" className="p-3">Publicação</th></tr></thead>
            <tbody className="divide-y divide-borda">
              {lista.map((p) => (
                <tr key={p.id}>
                  <th scope="row" className="p-3 font-medium"><Link href={`/producao/${p.id}`} className="text-verde-escuro hover:underline">{p.titulo}</Link><div className="mt-0.5 font-normal"><FormatoTag formato={p.formato} /></div></th>
                  <td className="p-3"><StatusBadge status={p.status} /></td><td className="p-3"><RedesTags redes={p.redes} /></td>
                  <td className="p-3">{p.responsavel_nome ?? "—"}</td><td className="p-3">{p.prazo ? formatDateTime(p.prazo) : "—"}</td><td className="p-3">{p.publicar_em ? formatDateTime(p.publicar_em) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
