import Link from "next/link";
import { requireUser } from "@/lib/auth/session";
import { TIPOS_NOTIFICACAO, TIPO_NOTIF_ROTULO, listar, preferencias } from "@/lib/services/notificacoes";
import { Badge, Card, Empty } from "@/components/ui";
import { ActionForm, Field, inputCls } from "@/components/action-form";
import { PushToggle } from "@/components/push-toggle";
import { brDate, utcToLocal } from "@/lib/time";
import { formatTime } from "@/lib/format";
import { marcarTodasAction, preferenciasAction } from "./actions";

export default async function Notificacoes() {
  const user = await requireUser();
  const [lista, pref] = await Promise.all([listar(user.id), preferencias(user.id)]);
  const naoLidas = lista.filter((n) => !n.lida_em).length;
  return (
    <div className="space-y-4">
      <h1 className="font-titulo text-2xl text-verde">Notificações</h1>
      <Card>
        {lista.length === 0 ? <Empty>Nenhuma notificação por enquanto.</Empty> : (
          <>
            <ul className="divide-y divide-borda">
              {lista.map((n) => (
                <li key={n.id}><Link href={`/notificacoes/abrir/${n.id}`} className="block min-h-14 py-2">
                  <span className="flex items-center gap-2">{!n.lida_em && <span className="h-2 w-2 shrink-0 rounded-full bg-verde" aria-label="não lida" />}<span className={n.lida_em ? "" : "font-semibold"}>{n.titulo}</span><Badge>{TIPO_NOTIF_ROTULO[n.tipo]}</Badge></span>
                  {n.corpo && <span className="block text-sm text-tinta/70">{n.corpo}</span>}
                  <span className="block text-xs text-tinta/50">{brDate(utcToLocal(n.criado_em).date)} {formatTime(n.criado_em)}</span>
                </Link></li>
              ))}
            </ul>
            {naoLidas > 0 && <ActionForm action={marcarTodasAction} submit="Marcar todas como lidas" className="mt-3"><span /></ActionForm>}
          </>
        )}
      </Card>
      <Card title="Neste dispositivo"><PushToggle /></Card>
      <Card title="Preferências">
        <ActionForm action={preferenciasAction} submit="Salvar preferências" resetOnOk={false}>
          <fieldset className="space-y-1"><legend className="mb-1 text-sm font-medium">Quero ser avisado sobre</legend>
            {TIPOS_NOTIFICACAO.map((t) => <label key={t} className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" name={`tipo_${t}`} defaultChecked={pref.tipos[t]} className="h-5 w-5" /> {TIPO_NOTIF_ROTULO[t]}</label>)}
          </fieldset>
          <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" name="pushAtivo" defaultChecked={pref.pushAtivo} className="h-5 w-5" /> Receber também no celular (push)</label>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Silêncio a partir de"><input name="silencioInicio" type="time" defaultValue={pref.silencioInicio ?? ""} className={inputCls} /></Field>
            <Field label="Silêncio até"><input name="silencioFim" type="time" defaultValue={pref.silencioFim ?? ""} className={inputCls} /></Field>
          </div>
          <p className="text-xs text-tinta/60">No horário de silêncio o push é adiado (as notificações continuam aqui). Você só recebe avisos sobre o que tem direito de ver.</p>
        </ActionForm>
      </Card>
    </div>
  );
}
