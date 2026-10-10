import { notFound } from "next/navigation";
import Link from "next/link";
import { requireUser } from "@/lib/auth/session";
import { contasECategorias, getLancamento } from "@/lib/services/financeiro";
import { can } from "@/lib/permissions";
import { NotFoundError } from "@/lib/services/errors";
import { Anexos } from "@/components/anexos";
import { Badge, Card } from "@/components/ui";
import { ActionForm, Field, inputCls } from "@/components/action-form";
import { LancamentoForm } from "@/components/lancamento-form";
import { StatusBadge, Valor } from "@/components/fin-ui";
import { formatBRL } from "@/lib/dinheiro";
import { brDate, todayLocal, utcToLocal } from "@/lib/time";
import { aprovarAction, editarLancamentoAction, estornarAction, rejeitarAction } from "../actions";

export default async function LancamentoDetalhe({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) notFound();
  let l;
  try { l = await getLancamento(user.id, id); } catch (e) { if (e instanceof NotFoundError) notFound(); throw e; }
  const [aprova, edita, { contas, categorias }] = await Promise.all([can(user.id, "financeiro", "aprovar", null), can(user.id, "financeiro", "editar", null), contasECategorias()]);
  const estornado = l.estornado_por != null;
  const valorInput = (l.valor_centavos / 100).toFixed(2).replace(".", ",");
  return (
    <div className="space-y-4">
      <Link href="/financeiro/lancamentos" className="inline-flex min-h-11 items-center text-sm text-verde">← Lançamentos</Link>
      <header>
        <div className="flex flex-wrap gap-1"><StatusBadge s={l.status} estornado={estornado} /><Badge>{l.tipo === "entrada" ? "Entrada" : "Saída"}</Badge>{l.estorno_de && <Link href={`/financeiro/${l.estorno_de}`}><Badge>estorno do nº {l.estorno_de}</Badge></Link>}</div>
        <h1 className="mt-1 font-titulo text-2xl text-verde">{l.descricao}</h1>
        <p className="text-2xl"><Valor c={l.valor_centavos} tipo={l.tipo} /></p>
        <p className="text-sm text-tinta/70">{brDate(String(l.data))} · {l.categoria_nome} · {l.conta_nome}</p>
        <p className="text-xs text-tinta/60">Lançado por {l.criador}{l.aprovador && ` · aprovado por ${l.aprovador} em ${brDate(utcToLocal(l.aprovado_em!).date)}`}</p>
        {(l.doador_user_id || l.doador_nome) && <p className="mt-1 text-sm">Doador: {l.doador_membro ?? l.doador_nome}</p>}
        {l.motivo && <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">Motivo: {l.motivo}</p>}
        {estornado && <p className="mt-2 text-sm">Estornado pelo lançamento <Link href={`/financeiro/${l.estornado_por}`} className="text-verde underline">nº {l.estornado_por}</Link>.</p>}
      </header>

      {l.status === "pendente" && aprova && (
        <Card title="Decisão">
          {l.criado_por === user.id ? <p className="text-sm text-tinta/70">Você lançou este item; outra pessoa precisa aprová-lo.</p> : (
            <div className="space-y-3">
              <ActionForm action={aprovarAction} submit="Aprovar lançamento"><input type="hidden" name="id" value={id} /></ActionForm>
              <ActionForm action={rejeitarAction} submit="Rejeitar" danger><input type="hidden" name="id" value={id} /><Field label="Motivo da rejeição"><input name="motivo" required minLength={3} maxLength={255} className={inputCls} /></Field></ActionForm>
            </div>
          )}
        </Card>
      )}
      <Anexos actor={user.id} tipo="lancamento" ctxId={id} titulo="Comprovantes" aceitar="application/pdf,image/jpeg,image/png,image/webp" />
      {l.status !== "aprovado" && edita && (
        <Card title="Editar lançamento"><LancamentoForm action={editarLancamentoAction} editando hoje={todayLocal()} contas={contas.filter((c) => c.ativa)} categorias={categorias.filter((c) => c.ativa)}
          valores={{ id, contaId: l.conta_id, categoriaId: l.categoria_id, tipo: l.tipo, valor: valorInput, data: String(l.data), descricao: l.descricao }} /></Card>
      )}
      {l.status === "aprovado" && !estornado && !l.estorno_de && aprova && (
        <Card title="Estorno">
          <p className="mb-2 text-sm text-tinta/70">Valores aprovados não são alterados. O estorno cria um lançamento de sentido oposto ({formatBRL(l.valor_centavos)}) na data de hoje, mantendo o original e o histórico.</p>
          <ActionForm action={estornarAction} submit="Estornar lançamento" danger><input type="hidden" name="id" value={id} /><Field label="Motivo do estorno"><input name="motivo" required minLength={3} maxLength={255} className={inputCls} /></Field></ActionForm>
        </Card>
      )}
    </div>
  );
}
