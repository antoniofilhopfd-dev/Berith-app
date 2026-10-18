import Link from "next/link";
import { requireUser } from "@/lib/auth/session";
import { exigir } from "@/lib/auth/pagina";
import { listarAuditoria, POR_PAGINA } from "@/lib/services/auditoria";
import { Card, Empty } from "@/components/ui";
import { formatDateTime } from "@/lib/format";
import { isDate } from "@/lib/time";

export const metadata = { title: "Logs e auditoria" };
export const dynamic = "force-dynamic";

export default async function Auditoria({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireUser();
  await exigir(user.id, "auditoria", "ver");
  const sp = await searchParams;
  const pagina = Math.max(1, Number(sp.p) || 1);
  const r = await listarAuditoria(user.id, { acao: sp.acao?.trim().slice(0, 40) || undefined, de: sp.de && isDate(sp.de) ? sp.de : undefined, ate: sp.ate && isDate(sp.ate) ? sp.ate : undefined, pagina });
  const paginas = Math.max(1, Math.ceil(r.total / POR_PAGINA));
  const q = (p: number) => { const u = new URLSearchParams(); for (const [k, v] of Object.entries({ ...sp, p: String(p) })) if (v) u.set(k, v); return `?${u.toString()}`; };
  return (
    <Card title="Registro de auditoria" className="overflow-x-auto">
      <form method="get" className="mb-3 flex flex-wrap items-end gap-2" aria-label="Filtros">
        <label className="text-xs">Ação começa com<input name="acao" defaultValue={sp.acao ?? ""} placeholder="ex.: publicacao." className="mt-1 block min-h-10 rounded-lg border border-borda px-2 text-sm" /></label>
        <label className="text-xs">De<input type="date" name="de" defaultValue={sp.de ?? ""} className="mt-1 block min-h-10 rounded-lg border border-borda px-2 text-sm" /></label>
        <label className="text-xs">Até<input type="date" name="ate" defaultValue={sp.ate ?? ""} className="mt-1 block min-h-10 rounded-lg border border-borda px-2 text-sm" /></label>
        <button className="min-h-10 rounded-lg bg-verde px-4 text-sm text-white">Filtrar</button>
      </form>
      {r.itens.length === 0 ? <Empty>Nenhum registro.</Empty> : (
        <table className="w-full min-w-[720px] text-left text-xs">
          <caption className="sr-only">Eventos de auditoria</caption>
          <thead className="border-b border-borda uppercase text-tinta/60"><tr><th scope="col" className="py-2">Quando</th><th scope="col">Quem</th><th scope="col">Ação</th><th scope="col">Objeto</th><th scope="col">IP</th><th scope="col">Detalhes</th></tr></thead>
          <tbody className="divide-y divide-borda">{r.itens.map((e) => <tr key={e.id}><td className="py-1.5 pr-2 whitespace-nowrap">{formatDateTime(e.criado_em)}</td><td className="pr-2">{e.nome ?? "sistema"}</td><td className="pr-2 font-medium">{e.acao}</td><td className="pr-2">{e.entidade ? `${e.entidade} #${e.entidade_id ?? ""}` : "—"}</td><td className="pr-2">{e.ip ?? "—"}</td><td className="max-w-xs truncate" title={e.detalhes ?? ""}>{e.detalhes ?? ""}</td></tr>)}</tbody>
        </table>
      )}
      <nav aria-label="Páginas" className="mt-3 flex items-center justify-center gap-3 text-sm">{pagina > 1 && <Link href={q(pagina - 1)} className="underline">‹ Anterior</Link>}<span>Página {pagina} de {paginas} · {r.total} registro(s)</span>{pagina < paginas && <Link href={q(pagina + 1)} className="underline">Próxima ›</Link>}</nav>
    </Card>
  );
}
