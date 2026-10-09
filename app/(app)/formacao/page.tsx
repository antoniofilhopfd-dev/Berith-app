import Link from "next/link";
import { requireUser } from "@/lib/auth/session";
import { listarConteudos, listarTrilhas } from "@/lib/services/formacao";
import { accessibleUnitIds } from "@/lib/permissions";
import { CATEGORIAS, CATEGORIA_ROTULO } from "@/lib/validation/formacao";
import { Badge, Card, Empty } from "@/components/ui";
import { inputCls } from "@/components/action-form";
import { Heart, Plus, Check } from "lucide-react";

export default async function Formacao({ searchParams }: { searchParams: Promise<{ c?: string; q?: string; f?: string; p?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const q = (sp.q ?? "").trim().slice(0, 80);
  const categoria = (CATEGORIAS as readonly string[]).includes(sp.c ?? "") ? sp.c : undefined;
  const favoritos = sp.f === "1";
  const page = Math.max(1, Math.min(500, Number(sp.p) || 1));
  const [{ itens, total, size }, trilhas, criar] = await Promise.all([
    listarConteudos(user.id, { categoria, q: q || undefined, favoritos, page }), listarTrilhas(user.id), accessibleUnitIds(user.id, "conteudos", "criar"),
  ]);
  const pode = criar === "todas" || criar.length > 0;
  const href = (o: Record<string, string | undefined>) => {
    const p = new URLSearchParams(); const m = { c: categoria, q: q || undefined, f: favoritos ? "1" : undefined, ...o };
    for (const [k, v] of Object.entries(m)) if (v) p.set(k, v);
    return `?${p.toString()}`;
  };
  const paginas = Math.max(1, Math.ceil(total / size));
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="font-titulo text-2xl text-verde">Orações e formação</h1>
        {pode && <Link href="/formacao/novo" className="inline-flex min-h-11 items-center gap-1 rounded-lg bg-verde px-3 text-sm text-white"><Plus size={16} aria-hidden /> Novo</Link>}
      </div>
      <form role="search" className="flex gap-2">
        {categoria && <input type="hidden" name="c" value={categoria} />}{favoritos && <input type="hidden" name="f" value="1" />}
        <input name="q" defaultValue={q} placeholder="Buscar orações e conteúdos" aria-label="Buscar" className={inputCls} />
        <button className="min-h-11 rounded-lg bg-verde px-4 text-sm text-white">Buscar</button>
      </form>
      <div className="flex gap-2 overflow-x-auto pb-1" aria-label="Categorias">
        <Link href={href({ c: undefined, f: undefined })} className={`min-h-11 shrink-0 content-center rounded-full border px-4 text-sm ${!categoria && !favoritos ? "border-verde bg-verde text-white" : "border-borda"}`}>Todos</Link>
        <Link href={href({ f: "1", c: undefined })} className={`inline-flex min-h-11 shrink-0 items-center gap-1 rounded-full border px-4 text-sm ${favoritos ? "border-verde bg-verde text-white" : "border-borda"}`}><Heart size={14} aria-hidden /> Favoritos</Link>
        {CATEGORIAS.map((c) => <Link key={c} href={href({ c, f: undefined })} className={`min-h-11 shrink-0 content-center rounded-full border px-4 text-sm ${categoria === c ? "border-verde bg-verde text-white" : "border-borda"}`}>{CATEGORIA_ROTULO[c]}</Link>)}
      </div>

      {trilhas.length > 0 && !categoria && !favoritos && !q && (
        <Card title="Trilhas formativas">
          <ul className="divide-y divide-borda">
            {trilhas.map((t) => (
              <li key={t.id}><Link href={`/formacao/trilhas/${t.id}`} className="block min-h-14 py-2">
                <span className="font-medium">{t.titulo}</span> {t.unit_nome && <Badge>{t.unit_nome}</Badge>}
                <span className="block text-xs text-tinta/60">{Number(t.feitos)} de {Number(t.total)} concluídos</span>
                <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-borda"><span className="block h-full bg-verde" style={{ width: `${Number(t.total) ? (Number(t.feitos) / Number(t.total)) * 100 : 0}%` }} /></span>
              </Link></li>
            ))}
          </ul>
          {pode && <Link href="/formacao/trilhas/nova" className="mt-2 inline-flex min-h-11 items-center text-sm text-verde underline">Criar trilha</Link>}
        </Card>
      )}

      <Card>
        {itens.length === 0 ? <Empty>{favoritos ? "Você ainda não tem favoritos." : "Nenhum conteúdo encontrado."}</Empty> : (
          <ul className="divide-y divide-borda">
            {itens.map((c) => (
              <li key={c.id}><Link href={`/formacao/${c.id}`} className="block min-h-14 py-2">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{c.titulo}</span>
                  {Number(c.favorito) === 1 && <Heart size={14} className="fill-cobre text-cobre" aria-label="favorito" />}
                  {Number(c.concluido) === 1 && <Check size={14} className="text-green-700" aria-label="concluído" />}
                  {!c.publicado && <Badge>rascunho</Badge>}
                </span>
                <span className="block text-xs text-tinta/60">{CATEGORIA_ROTULO[c.categoria as "oracao"]} · {c.unit_nome ?? "Toda a comunidade"}</span>
                {c.resumo && <span className="line-clamp-2 text-sm text-tinta/70">{c.resumo}</span>}
              </Link></li>
            ))}
          </ul>
        )}
        {paginas > 1 && (
          <nav className="mt-3 flex items-center justify-between text-sm" aria-label="Paginação">
            {page > 1 ? <Link href={href({ p: String(page - 1) })} className="min-h-11 content-center text-verde">← Anterior</Link> : <span />}
            <span>Página {page} de {paginas}</span>
            {page < paginas ? <Link href={href({ p: String(page + 1) })} className="min-h-11 content-center text-verde">Próxima →</Link> : <span />}
          </nav>
        )}
      </Card>
    </div>
  );
}
