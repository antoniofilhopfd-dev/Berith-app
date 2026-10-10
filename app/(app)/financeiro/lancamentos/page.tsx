import Link from "next/link";
import { requireUser } from "@/lib/auth/session";
import { contasECategorias, listarLancamentos, PAGE } from "@/lib/services/financeiro";
import { Card, Empty } from "@/components/ui";
import { SubNav, StatusBadge, Valor } from "@/components/fin-ui";
import { inputCls } from "@/components/action-form";
import { brDate, todayLocal } from "@/lib/time";

export default async function Lancamentos({ searchParams }: { searchParams: Promise<{ mes?: string; tipo?: string; status?: string; conta?: string; p?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const page = Math.max(1, Math.min(500, Number(sp.p) || 1));
  const mes = /^\d{4}-\d{2}$/.test(sp.mes ?? "") ? sp.mes : undefined;
  const [{ itens, total }, { contas }] = await Promise.all([listarLancamentos(user.id, { mes, tipo: sp.tipo, status: sp.status, contaId: Number(sp.conta) || undefined, page }), contasECategorias()]);
  const paginas = Math.max(1, Math.ceil(total / PAGE));
  const q = (p: number) => { const u = new URLSearchParams(); for (const [k, v] of Object.entries({ mes, tipo: sp.tipo, status: sp.status, conta: sp.conta })) if (v) u.set(k, v); u.set("p", String(p)); return `?${u}`; };
  return (
    <div className="space-y-4">
      <h1 className="font-titulo text-2xl text-verde">Lançamentos</h1>
      <SubNav ativo="lancamentos" />
      <Card>
        <form className="grid grid-cols-2 gap-2" role="search">
          <input name="mes" type="month" defaultValue={mes} aria-label="Mês" className={inputCls} />
          <select name="status" defaultValue={sp.status ?? ""} aria-label="Situação" className={inputCls}><option value="">Todas as situações</option><option value="pendente">Pendentes</option><option value="aprovado">Aprovados</option><option value="rejeitado">Rejeitados</option></select>
          <select name="tipo" defaultValue={sp.tipo ?? ""} aria-label="Tipo" className={inputCls}><option value="">Entradas e saídas</option><option value="entrada">Entradas</option><option value="saida">Saídas</option></select>
          <select name="conta" defaultValue={sp.conta ?? ""} aria-label="Conta" className={inputCls}><option value="">Todas as contas</option>{contas.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}</select>
          <button className="col-span-2 min-h-11 rounded-lg bg-verde text-sm text-white">Filtrar</button>
        </form>
      </Card>
      <Card>
        {itens.length === 0 ? <Empty>Nenhum lançamento encontrado.</Empty> : (
          <ul className="divide-y divide-borda">
            {itens.map((l) => (
              <li key={l.id}><Link href={`/financeiro/${l.id}`} className="flex min-h-14 items-center justify-between gap-3 py-2">
                <span className="min-w-0"><span className="block truncate font-medium">{l.descricao}</span><span className="block text-xs text-tinta/60">{brDate(String(l.data))} · {l.categoria_nome} · {l.conta_nome}{l.estorno_de && " · estorno"}</span></span>
                <span className="shrink-0 text-right"><Valor c={l.valor_centavos} tipo={l.tipo} /><span className="mt-0.5 block"><StatusBadge s={l.status} estornado={l.estornado_por != null} /></span></span>
              </Link></li>
            ))}
          </ul>
        )}
        {paginas > 1 && <nav className="mt-3 flex items-center justify-between text-sm" aria-label="Paginação">{page > 1 ? <Link href={q(page - 1)} className="min-h-11 content-center text-verde">← Anterior</Link> : <span />}<span>Página {page} de {paginas}</span>{page < paginas ? <Link href={q(page + 1)} className="min-h-11 content-center text-verde">Próxima →</Link> : <span />}</nav>}
      </Card>
    </div>
  );
}
