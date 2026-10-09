import Link from "next/link";
import { requireUser } from "@/lib/auth/session";
import { PAGE_SIZE, listPending, listPeople } from "@/lib/services/membros";
import { accessibleUnitIds, can } from "@/lib/permissions";
import { listUnits } from "@/lib/services/estruturas";
import { Badge, Card, Empty } from "@/components/ui";
import { ActionForm, Field, inputCls } from "@/components/action-form";
import { aprovarAction, convidarAction, rejeitarAction } from "./actions";
import { TIPO_LABEL, formatDate } from "@/lib/format";

export default async function Membros({ searchParams }: { searchParams: Promise<{ q?: string; p?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const q = (sp.q ?? "").trim().slice(0, 80);
  const page = Math.max(1, Math.min(1000, Number(sp.p) || 1));
  const [{ itens, total }, pendentes, convidarGlobal, podeConvidar] = await Promise.all([
    listPeople(user.id, { q, page }), listPending(user.id),
    can(user.id, "membros", "criar"), accessibleUnitIds(user.id, "membros", "criar"),
  ]);
  const unidadesConvite = podeConvidar === "todas" || podeConvidar.length ? (await listUnits(user.id)).filter((u) => u.ativo && (podeConvidar === "todas" || podeConvidar.includes(u.id))) : [];
  const paginas = Math.max(1, Math.ceil(total / PAGE_SIZE));
  return (
    <div className="space-y-4">
      <h1 className="font-titulo text-2xl text-verde">Membros</h1>

      {pendentes.length > 0 && (
        <Card title={`Aguardando aprovação (${pendentes.length})`}>
          <ul className="divide-y divide-borda">
            {pendentes.map((p) => (
              <li key={p.id} className="py-3">
                <p className="font-medium">{p.nome}</p>
                <p className="text-xs text-tinta/60">{p.email} · cadastrou-se em {formatDate(p.criado_em)}{p.estruturas && ` · para: ${p.estruturas}`}</p>
                <div className="mt-2 flex gap-2">
                  <ActionForm action={aprovarAction} submit="Aprovar" className="space-y-0"><input type="hidden" name="userId" value={p.id} /></ActionForm>
                  <ActionForm action={rejeitarAction} submit="Recusar" danger className="space-y-0"><input type="hidden" name="userId" value={p.id} /></ActionForm>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card title="Pessoas">
        <form className="mb-3 flex gap-2" role="search">
          <input name="q" defaultValue={q} placeholder="Buscar por nome ou e-mail" aria-label="Buscar" className={inputCls} />
          <button className="min-h-11 rounded-lg bg-verde px-4 text-sm text-white">Buscar</button>
        </form>
        {itens.length === 0 ? <Empty>Nenhuma pessoa encontrada.</Empty> : (
          <ul className="divide-y divide-borda">
            {itens.map((p) => (
              <li key={p.id}>
                <Link href={`/membros/${p.id}`} className="flex min-h-12 items-center justify-between gap-2 py-2">
                  <span><span className="font-medium">{p.nome}</span><span className="block text-xs text-tinta/60">{p.email}</span></span>
                  {p.status !== "ativo" && <Badge>{p.status}</Badge>}
                </Link>
              </li>
            ))}
          </ul>
        )}
        {paginas > 1 && (
          <nav className="mt-3 flex items-center justify-between text-sm" aria-label="Paginação">
            {page > 1 ? <Link href={`?q=${encodeURIComponent(q)}&p=${page - 1}`} className="min-h-11 content-center text-verde">← Anterior</Link> : <span />}
            <span>Página {page} de {paginas}</span>
            {page < paginas ? <Link href={`?q=${encodeURIComponent(q)}&p=${page + 1}`} className="min-h-11 content-center text-verde">Próxima →</Link> : <span />}
          </nav>
        )}
      </Card>

      {(convidarGlobal || unidadesConvite.length > 0) && (
        <Card title="Convidar novo membro">
          <p className="mb-2 text-xs text-tinta/60">O convidado cria a senha pelo link e só acessa o app depois de aprovado.</p>
          <ActionForm action={convidarAction} submit="Gerar convite">
            <Field label="Nome completo"><input name="nome" required minLength={2} className={inputCls} /></Field>
            <Field label="E-mail"><input name="email" type="email" required className={inputCls} /></Field>
            <Field label="Vincular a">
              <select name="unitId" className={inputCls} defaultValue={unidadesConvite[0]?.id ?? ""}>
                {convidarGlobal && <option value="">(nenhuma estrutura)</option>}
                {unidadesConvite.map((u) => <option key={u.id} value={u.id}>{TIPO_LABEL[u.tipo]}: {u.nome}</option>)}
              </select>
            </Field>
            <Field label="Função (opcional)"><input name="funcao" maxLength={80} className={inputCls} /></Field>
          </ActionForm>
        </Card>
      )}
    </div>
  );
}
