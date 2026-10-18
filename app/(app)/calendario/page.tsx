import Link from "next/link";
import { requireUser } from "@/lib/auth/session";
import { exigir } from "@/lib/auth/pagina";
import { permissoesDe } from "@/lib/permissions";
import * as P from "@/lib/services/publicacoes";
import { datasDoPeriodo } from "@/lib/services/planejamento";
import { opcoesProducao } from "@/lib/services/opcoes";
import { Calendario, type DiaCal } from "@/components/calendario";
import { PageHeader, btnSec } from "@/components/ui";
import { REDES, STATUS, textoDaRede, type Rede, type Status } from "@/lib/editorial";
import { navegar, periodo, type Visao } from "@/lib/calendario";
import { MESES, DIAS, isDate, localToUtc, utcToLocal } from "@/lib/time";
import { criarRapidaAction, moverPublicacaoAction } from "./actions";

export const metadata = { title: "Calendário editorial" };
export const dynamic = "force-dynamic";

export default async function CalendarioPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireUser();
  await exigir(user.id, "calendario", "ver");
  const sp = await searchParams;
  const visao: Visao = sp.view === "semana" || sp.view === "dia" ? sp.view : "mes";
  const hoje = utcToLocal(new Date()).date;
  const ancora = sp.d && isDate(sp.d) ? sp.d : hoje;
  const { inicio, fim, dias, mesRef } = periodo(visao, ancora);
  const rede = REDES.includes(sp.rede as Rede) ? (sp.rede as Rede) : undefined;
  const status = STATUS.includes(sp.status as Status) ? (sp.status as Status) : undefined;
  const resp = sp.resp && Number(sp.resp) > 0 ? Number(sp.resp) : undefined;
  const [perms, op] = await Promise.all([permissoesDe(user.id), opcoesProducao(user.id)]);
  const [lista, datas] = await Promise.all([
    P.listar(user.id, { de: localToUtc(inicio, "00:00"), ate: localToUtc(fim, "00:00"), rede, responsavelId: resp, status: status ? [status] : ["rascunho", "em_producao", "em_revisao", "ajustes_solicitados", "aprovado", "agendado", "publicado"], limite: 500 }),
    datasDoPeriodo(user.id, inicio, addUm(fim)),
  ]);
  const podeEditarTudo = perms.has("producao:excluir");
  const porDia = new Map<string, DiaCal>();
  for (const d of dias) porDia.set(d, { data: d, itens: [], datas: [], foraDoMes: visao === "mes" && d.slice(0, 7) !== mesRef });
  for (const d of datas) porDia.get(d.dia)?.datas.push(d.nome);
  for (const p of lista) {
    const loc = utcToLocal(new Date(p.publicar_em!));
    const dia = porDia.get(loc.date);
    if (!dia) continue;
    const livre = !["publicado", "cancelado"].includes(p.status);
    dia.itens.push({
      id: p.id, titulo: p.titulo, formato: p.formato, status: p.status, hora: loc.time, redes: p.redes, responsavel: p.responsavel_nome, corCampanha: p.campanha_cor,
      trecho: textoDaRede({ legenda: p.legenda, hashtags: p.hashtags }, {}).slice(0, 300),
      podeMover: livre && (p.status === "agendado" ? perms.has("publicacao:editar") : perms.has("producao:editar") && (podeEditarTudo || p.criado_por === user.id || p.responsavel_id === user.id)),
    });
  }
  for (const d of porDia.values()) d.itens.sort((a, b) => a.hora.localeCompare(b.hora));

  const q = (o: Record<string, string | undefined>) => { const u = new URLSearchParams(); for (const [k, v] of Object.entries({ view: visao, d: ancora, rede: sp.rede, status: sp.status, resp: sp.resp, ...o })) if (v) u.set(k, v); return `?${u.toString()}`; };
  const [ano, mes] = ancora.split("-").map(Number);
  const titulo = visao === "mes" ? `${MESES[mes - 1][0].toUpperCase()}${MESES[mes - 1].slice(1)} de ${ano}` : visao === "dia" ? `${DIAS[new Date(ancora + "T12:00:00Z").getUTCDay()]}, ${ancora.split("-").reverse().join("/")}` : `Semana de ${inicio.split("-").reverse().slice(0, 2).join("/")} a ${addUm(fim, -1).split("-").reverse().slice(0, 2).join("/")}`;

  return (
    <div>
      <PageHeader titulo="Calendário editorial" sub="Arraste uma publicação para outro dia para reagendar. Clique em + para criar.">
        {perms.has("producao:criar") && <Link href="/producao/nova" className={btnSec}>Nova produção</Link>}
      </PageHeader>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="inline-flex overflow-hidden rounded-lg border border-borda" role="group" aria-label="Período">
          <Link href={q({ d: navegar(visao, ancora, -1) })} aria-label="Anterior" className="flex min-h-10 items-center bg-white px-3 hover:bg-fundo">‹</Link>
          <Link href={q({ d: hoje })} className="flex min-h-10 items-center border-x border-borda bg-white px-3 text-sm hover:bg-fundo">Hoje</Link>
          <Link href={q({ d: navegar(visao, ancora, 1) })} aria-label="Próximo" className="flex min-h-10 items-center bg-white px-3 hover:bg-fundo">›</Link>
        </div>
        <h2 className="text-lg font-semibold text-verde-escuro" aria-live="polite">{titulo}</h2>
        <div className="ml-auto inline-flex overflow-hidden rounded-lg border border-borda" role="group" aria-label="Visualização">
          {(["mes", "semana", "dia"] as const).map((v) => <Link key={v} href={q({ view: v })} aria-current={visao === v ? "true" : undefined} className={`flex min-h-10 items-center px-3 text-sm ${visao === v ? "bg-verde text-white" : "bg-white hover:bg-fundo"}`}>{v === "mes" ? "Mês" : v === "semana" ? "Semana" : "Dia"}</Link>)}
        </div>
      </div>
      <form method="get" className="mb-4 flex flex-wrap items-center gap-2" aria-label="Filtros do calendário">
        <input type="hidden" name="view" value={visao} /><input type="hidden" name="d" value={ancora} />
        <select name="rede" defaultValue={sp.rede ?? ""} aria-label="Rede social" className="min-h-10 rounded-lg border border-borda px-2 text-sm"><option value="">Todas as redes</option>{REDES.map((r) => <option key={r} value={r}>{r[0].toUpperCase() + r.slice(1)}</option>)}</select>
        <select name="resp" defaultValue={sp.resp ?? ""} aria-label="Responsável" className="min-h-10 rounded-lg border border-borda px-2 text-sm"><option value="">Todos os responsáveis</option>{op.pessoas.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}</select>
        <select name="status" defaultValue={sp.status ?? ""} aria-label="Situação" className="min-h-10 rounded-lg border border-borda px-2 text-sm"><option value="">Todas as situações</option>{STATUS.filter((s) => s !== "cancelado").map((s) => <option key={s} value={s}>{s.replace("_", " ")}</option>)}</select>
        <button className="min-h-10 rounded-lg bg-verde px-4 text-sm text-white">Filtrar</button>
        {(sp.rede || sp.resp || sp.status) && <Link href={q({ rede: undefined, resp: undefined, status: undefined })} className="text-sm underline">Limpar</Link>}
      </form>
      <Calendario visao={visao} dias={dias.map((d) => porDia.get(d)!)} hoje={hoje} podeCriar={perms.has("producao:criar")} mover={moverPublicacaoAction} criarRapida={criarRapidaAction} />
      <p className="mt-3 text-xs text-tinta/60">Datas em destaque (cobre) são sugestões do calendário católico e civil, calculadas automaticamente; confirme no calendário oficial. Datas próprias do ministério são cadastradas em Planejamento.</p>
    </div>
  );
}

function addUm(d: string, n = 0) { const t = new Date(d + "T12:00:00Z"); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); }
