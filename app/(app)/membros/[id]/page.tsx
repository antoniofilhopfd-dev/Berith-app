import { notFound } from "next/navigation";
import Link from "next/link";
import { requireUser } from "@/lib/auth/session";
import { getPerson } from "@/lib/services/membros";
import { can, ForbiddenError } from "@/lib/permissions";
import { listRoles } from "@/lib/services/papeis";
import { NotFoundError } from "@/lib/services/errors";
import { PAPEL_LABEL, TIPO_LABEL, formatDate } from "@/lib/format";
import { Badge, Card, Empty } from "@/components/ui";
import { ActionForm, Field, inputCls } from "@/components/action-form";
import { atribuirPapelAction, revogarPapelAction } from "../../estruturas/actions";
import { gerarLinkSenhaAction, situacaoAction } from "../actions";

export default async function Pessoa({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) notFound();
  let d;
  try { d = await getPerson(user.id, id); } catch (e) {
    if (e instanceof NotFoundError || e instanceof ForbiddenError) notFound();
    throw e;
  }
  const admin = await can(user.id, "membros", "permissoes");
  const globais = admin ? (await listRoles()).filter((r) => r.e_global) : [];
  return (
    <div className="space-y-4">
      <Link href="/membros" className="inline-flex min-h-11 items-center text-sm text-vinho">← Membros</Link>
      <header>
        <h1 className="font-titulo text-2xl text-vinho">{d.pessoa.nome}</h1>
        <p className="text-sm text-tinta/70">{d.pessoa.email}{d.pessoa.telefone && ` · ${d.pessoa.telefone}`}</p>
        <div className="mt-1 flex gap-2"><Badge>{d.pessoa.status}</Badge>{d.pessoa.situacao && <Badge>vínculo: {d.pessoa.situacao}</Badge>}</div>
      </header>
      <Card title="Vínculos">
        {d.vinculos.length === 0 ? <Empty>Nenhum vínculo visível para você.</Empty> : (
          <ul className="divide-y divide-borda text-sm">
            {d.vinculos.map((v) => (
              <li key={v.id} className="py-2">
                <Link href={`/estruturas/${v.unit_id}`} className="font-medium text-vinho">{v.nome}</Link> ({TIPO_LABEL[v.tipo]})
                <p className="text-xs text-tinta/60">{v.funcao ?? "Integrante"} · {formatDate(v.inicio)}{v.fim ? ` a ${formatDate(v.fim)} (encerrado)` : " · ativo"}</p>
              </li>
            ))}
          </ul>
        )}
      </Card>
      {admin && (
        <>
          <Card title="Funções">
            {d.papeis.length === 0 ? <Empty>Sem funções atribuídas.</Empty> : (
              <ul className="mb-3 divide-y divide-borda text-sm">
                {d.papeis.map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-2 py-2">
                    <span>{PAPEL_LABEL[p.codigo] ?? p.nome}{p.unit_nome && <span className="text-tinta/60"> — {p.unit_nome}</span>}</span>
                    <ActionForm action={revogarPapelAction} submit="Revogar" danger className="space-y-0"><input type="hidden" name="userRoleId" value={p.id} /></ActionForm>
                  </li>
                ))}
              </ul>
            )}
            <ActionForm action={atribuirPapelAction} submit="Atribuir função global">
              <input type="hidden" name="userId" value={id} />
              <Field label="Função global">
                <select name="codigo" className={inputCls}>{globais.map((r) => <option key={r.codigo} value={r.codigo}>{PAPEL_LABEL[r.codigo] ?? r.nome}</option>)}</select>
              </Field>
            </ActionForm>
          </Card>
          {id !== user.id && (
            <Card title="Acesso">
              <div className="space-y-3">
                <ActionForm action={situacaoAction} submit={d.pessoa.status === "ativo" ? "Suspender acesso" : "Reativar acesso"} danger={d.pessoa.status === "ativo"}>
                  <input type="hidden" name="userId" value={id} />
                  <input type="hidden" name="status" value={d.pessoa.status === "ativo" ? "suspenso" : "ativo"} />
                </ActionForm>
                <ActionForm action={gerarLinkSenhaAction} submit="Gerar link de nova senha"><input type="hidden" name="userId" value={id} /></ActionForm>
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
