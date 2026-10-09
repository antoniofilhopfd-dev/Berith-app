import Link from "next/link";
import { requireUser } from "@/lib/auth/session";
import { listForUser, listManaged } from "@/lib/services/comunicados";
import { accessibleUnitIds, can } from "@/lib/permissions";
import { query } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { Badge, Card, Empty } from "@/components/ui";
import { ActionForm, Field, inputCls } from "@/components/action-form";
import { publicarComunicadoAction } from "./actions";
import { TIPO_LABEL } from "@/lib/format";
import type { RowDataPacket } from "mysql2/promise";

export default async function Comunicados() {
  const user = await requireUser();
  const [lista, gerenciados, criarGlobal, criarEm] = await Promise.all([
    listForUser(user.id), listManaged(user.id), can(user.id, "comunicados", "criar", null), accessibleUnitIds(user.id, "comunicados", "criar"),
  ]);
  const unidades = criarEm === "todas"
    ? await query<RowDataPacket & { id: number; nome: string; tipo: string }>("SELECT id, nome, tipo FROM org_units WHERE ativo = 1 ORDER BY tipo, nome")
    : criarEm.length ? await query<RowDataPacket & { id: number; nome: string; tipo: string }>("SELECT id, nome, tipo FROM org_units WHERE ativo = 1 AND id IN (?) ORDER BY tipo, nome", [criarEm]) : [];
  const podePublicar = criarGlobal || unidades.length > 0;
  return (
    <div className="space-y-4">
      <h1 className="font-titulo text-2xl text-verde">Comunicados</h1>
      {lista.length === 0 ? <Card><Empty>Nenhum comunicado para você no momento.</Empty></Card> : (
        <ul className="space-y-3">
          {lista.map((a) => (
            <li key={a.id}>
              <Link href={`/comunicados/${a.id}`} className={`block rounded-2xl border bg-cartao p-4 ${a.prioridade === "urgente" ? "border-red-300" : "border-borda"}`}>
                <div className="flex flex-wrap items-center gap-1">
                  {!a.lido_em && <span className="h-2 w-2 rounded-full bg-verde" aria-label="não lido" />}
                  {a.prioridade !== "normal" && <Badge>{a.prioridade}</Badge>}
                  <Badge>{a.unit_nome ?? "Toda a comunidade"}</Badge>
                </div>
                <p className={`mt-1 ${a.lido_em ? "" : "font-semibold"}`}>{a.titulo}</p>
                <p className="line-clamp-2 text-sm text-tinta/70">{a.corpo}</p>
                <p className="mt-1 text-xs text-tinta/50">{formatDate(a.publicar_em)} · {a.autor}</p>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {gerenciados.length > 0 && (
        <Card title="Gerenciar (inclui agendados e expirados)">
          <ul className="divide-y divide-borda text-sm">
            {gerenciados.map((a) => (
              <li key={a.id}>
                <Link href={`/comunicados/${a.id}`} className="flex min-h-12 items-center justify-between gap-2 py-2">
                  <span>{a.titulo}<span className="block text-xs text-tinta/60">{a.unit_nome ?? "Toda a comunidade"} · {a.lidos} leitura(s)</span></span>
                  <Badge>{a.estado}</Badge>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {podePublicar && (
        <Card title="Novo comunicado">
          <ActionForm action={publicarComunicadoAction} submit="Publicar">
            <Field label="Título"><input name="titulo" required minLength={3} maxLength={160} className={inputCls} /></Field>
            <Field label="Mensagem"><textarea name="corpo" required rows={4} maxLength={8000} className={inputCls + " resize-none py-2"} /></Field>
            <Field label="Destinatários">
              <select name="unitId" className={inputCls} defaultValue={criarGlobal ? "" : unidades[0]?.id}>
                {criarGlobal && <option value="">Toda a comunidade</option>}
                {unidades.map((u) => <option key={u.id} value={u.id}>{TIPO_LABEL[u.tipo]}: {u.nome}</option>)}
              </select>
            </Field>
            <Field label="Prioridade">
              <select name="prioridade" className={inputCls}><option value="normal">Normal</option><option value="importante">Importante</option><option value="urgente">Urgente</option></select>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Agendar para (data)"><input name="publicarData" type="date" className={inputCls} /></Field>
              <Field label="Hora (24h)"><input name="publicarHora" type="time" className={inputCls} /></Field>
            </div>
            <Field label="Expira em (data, opcional)"><input name="expiraData" type="date" className={inputCls} /></Field>
            <p className="text-xs text-tinta/60">Sem data de agendamento, o comunicado é publicado agora. Depois de publicar, abra o comunicado para anexar arquivos.</p>
          </ActionForm>
        </Card>
      )}
    </div>
  );
}
