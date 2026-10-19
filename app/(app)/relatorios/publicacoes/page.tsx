import { contaPreferida } from "@/lib/auth/conta";
import { requireUser } from "@/lib/auth/session";
import { exigir } from "@/lib/auth/pagina";
import { ORDENS, ORDEM_ROTULO, FORMATOS_FILTRO, JANELAS, JANELA_ROTULO, listarPublicacoes } from "@/lib/services/desempenho";
import { Card, Empty } from "@/components/ui";
import { RelNav } from "@/components/rel-nav";
import { formatNumber } from "@/lib/format";

export const metadata = { title: "Relatórios — Publicações" };
export const dynamic = "force-dynamic";

const dataBr = (d: Date) => new Date(d).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
const campo = "mt-1 block min-h-10 rounded-lg border border-borda bg-white px-2 text-sm";
const valor = (v: number | null) => (v == null ? "—" : formatNumber(v));

export default async function Publicacoes({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireUser();
  await exigir(user.id, "relatorios", "ver");
  const sp = await searchParams;
  const d = await listarPublicacoes(user.id, { ...sp, conta: sp.conta ?? (await contaPreferida()) });
  return (
    <div className="space-y-5">
      <header className="rounded-2xl border border-borda bg-cartao p-5">
        <h1 className="font-titulo text-2xl text-verde-escuro">O que funcionou em cada publicação</h1>
        <p className="mt-1 text-sm text-tinta/70">Alcance, curtidas, comentários, compartilhamentos, salvamentos e engajamento de cada post{d.conta ? ` de ${d.conta}` : ""}. Engajamento = interações ÷ alcance do post.</p>
        <div className="mt-3"><RelNav atual="publicacoes" conta={d.contas.length > 1 ? d.contaId : null} /></div>
      </header>

      <form method="get" className="flex flex-wrap items-end gap-2 rounded-xl border border-borda bg-cartao p-3" aria-label="Filtros">
        <label className="text-xs">Período<select name="janela" defaultValue={d.janela} className={campo}>{JANELAS.map((j) => <option key={j} value={j}>{j === "ano" ? "Ano" : j === "todo" ? "Todo o período" : `Últimos ${JANELA_ROTULO[j]}`}</option>)}</select></label>
        <label className="text-xs">Ano<select name="ano" defaultValue={d.ano} className={campo}>{[...d.anos].reverse().map((a) => <option key={a} value={a}>{a}</option>)}</select></label>
        <label className="text-xs">Formato<select name="formato" defaultValue={d.formato} className={campo}>{FORMATOS_FILTRO.map((f) => <option key={f} value={f}>{f === "todos" ? "Todos os formatos" : f}</option>)}</select></label>
        <label className="text-xs">Ordenar por<select name="ordem" defaultValue={d.ordem} className={campo}>{ORDENS.map((o) => <option key={o} value={o}>{ORDEM_ROTULO[o]}</option>)}</select></label>
        <button className="min-h-10 rounded-lg bg-verde px-4 text-sm text-white">Aplicar</button>
        <span className="ml-auto text-xs text-tinta/60">{d.total} publicação(ões)</span>
      </form>

      {d.grupos.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {d.grupos.map((g) => (
            <Card key={g.formato} title={`${g.formato} — ${g.posts} post(s)`}>
              <dl className="grid grid-cols-3 gap-2 text-center">
                <div><dd className="text-xl font-semibold text-verde-escuro">{formatNumber(g.interacoesMedia)}</dd><dt className="text-[11px] text-tinta/60">interações (média)</dt></div>
                <div><dd className="text-xl font-semibold text-verde-escuro">{valor(g.alcanceMedio)}</dd><dt className="text-[11px] text-tinta/60">alcance (média)</dt></div>
                <div><dd className="text-xl font-semibold text-verde-escuro">{g.engajamentoMedio == null ? "—" : `${g.engajamentoMedio.toLocaleString("pt-BR")}%`}</dd><dt className="text-[11px] text-tinta/60">engajamento (média)</dt></div>
              </dl>
            </Card>
          ))}
        </div>
      )}

      {d.melhor && (
        <p className="rounded-lg border border-borda bg-cartao p-3 text-sm">★ <strong>Melhor publicação do período:</strong> {d.melhor.url ? <a href={d.melhor.url} target="_blank" rel="noopener noreferrer" className="text-verde-escuro hover:underline">{(d.melhor.legenda ?? "Sem legenda").slice(0, 120)}</a> : (d.melhor.legenda ?? "Sem legenda").slice(0, 120)} — {formatNumber(d.melhor.interacoes)} interações.</p>
      )}

      {d.posts.length === 0 ? <Card><Empty>Nenhuma publicação neste período. Use “Atualizar dados do Instagram agora” na Visão geral.</Empty></Card> : (
        <ul className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4 xl:grid-cols-5">
          {d.posts.map((p) => (
            <li key={p.id} className="overflow-hidden rounded-xl border border-borda bg-cartao">
              <a href={p.url ?? undefined} target="_blank" rel="noopener noreferrer" aria-label={`Abrir publicação de ${dataBr(p.publicado_em)} no Instagram`} className="block">
                {p.miniatura ? <img src={p.miniatura} alt="" loading="lazy" referrerPolicy="no-referrer" className="aspect-square w-full object-cover" /> : <span className="flex aspect-square w-full items-center justify-center bg-borda/40 text-xs text-tinta/50">sem imagem</span>}
              </a>
              <div className="p-2 text-xs sm:p-3">
                <p className="flex justify-between font-semibold uppercase text-tinta/60"><span>{p.formato}</span><span>{dataBr(p.publicado_em)}</span></p>
                <p className="mt-1 line-clamp-3 min-h-[3.6em] text-xs sm:text-sm">{p.legenda ?? "Sem legenda"}</p>
                <dl className="mt-2 grid grid-cols-3 gap-x-1 gap-y-1">
                  <div><dd className="font-semibold">{valor(p.curtidas)}</dd><dt className="text-[10px] text-tinta/60">Curtidas</dt></div>
                  <div><dd className="font-semibold">{valor(p.comentarios)}</dd><dt className="text-[10px] text-tinta/60">Coment.</dt></div>
                  <div><dd className="font-semibold">{valor(p.salvamentos)}</dd><dt className="text-[10px] text-tinta/60">Salvos</dt></div>
                  <div><dd className="font-semibold">{valor(p.compartilhamentos)}</dd><dt className="text-[10px] text-tinta/60">Compart.</dt></div>
                  <div><dd className="font-semibold">{valor(p.alcance)}</dd><dt className="text-[10px] text-tinta/60">Alcance</dt></div>
                  <div><dd className="font-semibold">{p.engajamento == null ? "—" : `${p.engajamento.toLocaleString("pt-BR")}%`}</dd><dt className="text-[10px] text-tinta/60">Engaj.</dt></div>
                </dl>
              </div>
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs text-tinta/60">Dados da API oficial da Meta; “—” = a Meta não informou (alcance e salvamentos só vêm dos posts mais recentes). Nada é estimado.</p>
    </div>
  );
}
