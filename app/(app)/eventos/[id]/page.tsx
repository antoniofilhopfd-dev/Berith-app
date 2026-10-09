import { notFound } from "next/navigation";
import Link from "next/link";
import { requireUser } from "@/lib/auth/session";
import { canManageEvent, eventHistory, getEvent, hasPassed, rsvpSummary } from "@/lib/services/eventos";
import { occurrences } from "@/lib/services/recorrencia";
import { NotFoundError } from "@/lib/services/errors";
import { ForbiddenError } from "@/lib/permissions";
import { query } from "@/lib/db";
import { brDate, isDate, todayLocal, utcToLocal } from "@/lib/time";
import { formatTime } from "@/lib/format";
import { Badge, Card, Empty } from "@/components/ui";
import { ActionForm, Field, inputCls } from "@/components/action-form";
import { cancelarEventoAction, cancelarOcorrenciaAction, confirmarPresencaAction } from "../actions";
import { horario, tituloDia } from "@/components/evento-ui";
import type { RowDataPacket } from "mysql2/promise";

const STATUS = [["confirmado", "Vou"], ["talvez", "Talvez"], ["nao_vai", "Não vou"]] as const;
const ROTULO: Record<string, string> = { confirmado: "Confirmado", talvez: "Talvez", nao_vai: "Não vai" };

export default async function EventoDetalhe({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ d?: string }> }) {
  const user = await requireUser();
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) notFound();
  let ev;
  try { ev = await getEvent(user.id, id); } catch (e) {
    if (e instanceof NotFoundError || e instanceof ForbiddenError) notFound();
    throw e;
  }
  const sp = await searchParams;
  const todas = occurrences(ev, new Date(0), new Date("2100-01-01"));
  const alvo = sp.d && isDate(sp.d) ? sp.d : utcToLocal(ev.inicio).date;
  const occ = todas.find((o) => o.date === alvo) ?? todas[0];
  if (!occ) notFound();
  const [exc, resumo, gerencia, meu] = await Promise.all([
    query<RowDataPacket>("SELECT 1 x FROM event_exceptions WHERE event_id = ? AND occurrence_date = ?", [id, occ.date]),
    rsvpSummary(user.id, id, occ.date),
    canManageEvent(user.id, ev.unit_id, "editar"),
    query<RowDataPacket>("SELECT status FROM event_rsvps WHERE event_id = ? AND occurrence_date = ? AND user_id = ?", [id, occ.date, user.id]),
  ]);
  const cancelada = Boolean(ev.cancelado_em) || exc.length > 0;
  const passou = hasPassed(occ);
  const podeExcluir = await canManageEvent(user.id, ev.unit_id, "excluir");
  const historico = gerencia ? await eventHistory(user.id, id) : [];
  const proximas = todas.filter((o) => o.date >= todayLocal()).slice(0, 6);
  const vagas = ev.limite_participantes;
  const lotado = vagas != null && resumo.confirmado >= vagas && meu[0]?.status !== "confirmado";

  return (
    <div className="space-y-4">
      <Link href="/eventos" className="inline-flex min-h-11 items-center text-sm text-vinho">← Agenda</Link>
      <header>
        <div className="flex flex-wrap gap-1">
          <Badge>{ev.unit_nome ?? "Toda a comunidade"}</Badge>
          {cancelada && <Badge>cancelado</Badge>}
          {ev.recorrencia !== "nenhuma" && <Badge>{ev.recorrencia === "semanal" ? "toda semana" : "todo mês"} até {brDate(String(ev.recorrencia_ate))}</Badge>}
        </div>
        <h1 className={`mt-1 font-titulo text-2xl text-vinho ${cancelada ? "line-through opacity-60" : ""}`}>{ev.titulo}</h1>
        <p className="mt-1 text-sm">{tituloDia(occ.date)} · {horario(occ)}</p>
        {occ.fim && utcToLocal(occ.fim).date !== occ.date && <p className="text-sm text-tinta/70">Termina em {brDate(utcToLocal(occ.fim).date)} às {formatTime(occ.fim)}</p>}
        {ev.local && <p className="text-sm text-tinta/70">📍 {ev.local}</p>}
        {ev.responsavel_nome && <p className="text-sm text-tinta/70">Responsável: {ev.responsavel_nome}</p>}
        {ev.cancelado_motivo && <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">Cancelado: {ev.cancelado_motivo}</p>}
        {exc[0] && <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">Esta data foi cancelada.</p>}
        {ev.descricao && <p className="mt-3 whitespace-pre-line text-sm">{ev.descricao}</p>}
      </header>

      {!cancelada && !passou && (
        <Card title="Você vai?">
          <div className="grid grid-cols-3 gap-2">
            {STATUS.map(([s, l]) => (
              <ActionForm key={s} action={confirmarPresencaAction} submit={l} className="space-y-0">
                <input type="hidden" name="eventId" value={id} /><input type="hidden" name="date" value={occ.date} /><input type="hidden" name="status" value={s} />
              </ActionForm>
            ))}
          </div>
          <p className="mt-2 text-sm">
            {meu[0] ? <>Sua resposta: <strong>{ROTULO[meu[0].status]}</strong>. </> : "Você ainda não respondeu. "}
            {resumo.confirmado} confirmado(s){vagas != null && ` de ${vagas} vagas`}.{lotado && " Vagas esgotadas."}
          </p>
        </Card>
      )}
      {passou && !cancelada && <Card><Empty>Este evento já aconteceu.</Empty></Card>}

      {ev.recorrencia !== "nenhuma" && proximas.length > 1 && (
        <Card title="Próximas datas">
          <div className="flex flex-wrap gap-2">
            {proximas.map((o) => (
              <Link key={o.date} href={`/eventos/${id}?d=${o.date}`} className={`min-h-11 content-center rounded-lg border px-3 text-sm ${o.date === occ.date ? "border-vinho bg-vinho text-white" : "border-borda"}`}>{brDate(o.date).slice(0, 5)}</Link>
            ))}
          </div>
        </Card>
      )}

      {gerencia && (
        <>
          <Card title="Participantes (visível para a organização)">
            {resumo.nomes && resumo.nomes.length > 0 ? (
              <ul className="divide-y divide-borda text-sm">{resumo.nomes.map((n, i) => <li key={i} className="flex justify-between py-2"><span>{n.nome}</span><Badge>{ROTULO[n.status]}</Badge></li>)}</ul>
            ) : <Empty>Ninguém respondeu ainda.</Empty>}
          </Card>
          {!cancelada && (
            <Card title="Gerenciar">
              <div className="mb-3 flex flex-wrap gap-2">
                <Link href={`/eventos/${id}/editar`} className="inline-flex min-h-11 items-center rounded-lg border border-vinho px-4 text-sm text-vinho">Editar evento</Link>
                <Link href={`/eventos/${id}/presencas?d=${occ.date}`} className="inline-flex min-h-11 items-center rounded-lg border border-vinho px-4 text-sm text-vinho">Chamada / presenças</Link>
              </div>
              {podeExcluir && (
                <div className="space-y-4">
                  {ev.recorrencia !== "nenhuma" && (
                    <ActionForm action={cancelarOcorrenciaAction} submit={`Cancelar só ${brDate(occ.date).slice(0, 5)}`} danger>
                      <input type="hidden" name="id" value={id} /><input type="hidden" name="date" value={occ.date} />
                      <Field label="Motivo (opcional)"><input name="motivo" maxLength={255} className={inputCls} /></Field>
                    </ActionForm>
                  )}
                  <ActionForm action={cancelarEventoAction} submit={ev.recorrencia !== "nenhuma" ? "Cancelar toda a série" : "Cancelar evento"} danger>
                    <input type="hidden" name="id" value={id} />
                    <Field label="Motivo (opcional)"><input name="motivo" maxLength={255} className={inputCls} /></Field>
                  </ActionForm>
                </div>
              )}
            </Card>
          )}
          <Card title="Histórico de alterações">
            <ul className="divide-y divide-borda text-sm">
              {historico.map((h, i) => (
                <li key={i} className="py-2"><strong>{h.acao.replace("_", " ")}</strong> por {h.nome ?? "—"}
                  <span className="block text-xs text-tinta/60">{brDate(utcToLocal(h.criado_em).date)} {formatTime(h.criado_em)}</span></li>
              ))}
            </ul>
          </Card>
        </>
      )}
    </div>
  );
}
