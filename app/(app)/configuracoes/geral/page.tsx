import type { RowDataPacket } from "mysql2/promise";
import { query } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { exigir } from "@/lib/auth/pagina";
import { lerConfig } from "@/lib/services/configuracoes";
import { pushConfigurado } from "@/lib/services/push";
import { cifraDisponivel } from "@/lib/integracoes/cripto";
import { Badge, Card } from "@/components/ui";
import { formatDateTime } from "@/lib/format";
import { agoraMs } from "@/lib/time";
import { permissoesDe } from "@/lib/permissions";
import { ActionForm } from "@/components/action-form";
import { executarAgendadorAction } from "../actions";

export const metadata = { title: "Configurações gerais" };
export const dynamic = "force-dynamic";

export default async function Geral() {
  const user = await requireUser();
  await exigir(user.id, "configuracoes", "ver");
  const [cfg, mig, ult, perms, ag, neg] = await Promise.all([
    lerConfig(),
    query<RowDataPacket>("SELECT COUNT(*) n, MAX(id) ultima FROM schema_migrations WHERE resultado = 'ok'"),
    query<RowDataPacket>("SELECT valor FROM settings WHERE chave = 'cron_ultima_execucao'"),
    permissoesDe(user.id),
    query<RowDataPacket>("SELECT valor FROM settings WHERE chave = 'agendador_ultima_execucao'"),
    query<RowDataPacket>("SELECT valor FROM settings WHERE chave = 'cron_negado_em'"),
  ]);
  const cron = ult[0] ? new Date(String(ult[0].valor)) : null;
  const geral = ag[0] ? new Date(String(ag[0].valor)) : null;
  let negado: { quando: Date; motivo: string } | null = null;
  try { if (neg[0]) { const j = JSON.parse(String(neg[0].valor)); negado = { quando: new Date(j.quando), motivo: String(j.motivo) }; } } catch { /* sem diagnóstico */ }
  const negadoRecente = negado && (!cron || negado.quando > cron) && agoraMs() - negado.quando.getTime() < 60 * 60_000;
  const atrasado = cron ? agoraMs() - cron.getTime() > 15 * 60_000 : true;
  const sim = (ok: boolean, rot: string) => <Badge tom={ok ? "verde" : "amarelo"}>{ok ? "sim" : rot}</Badge>;
  const linhas: [string, React.ReactNode][] = [
    ["Fuso horário", cfg.fusoHorario], ["Banco de dados", `${mig[0].n} migrações aplicadas (última: ${mig[0].ultima ?? "—"})`],
    ["Agendador (cron)", cron ? <span key="c">última execução {formatDateTime(cron)} {atrasado && <Badge tom="amarelo">atrasado</Badge>}</span> : <Badge tom="amarelo">nunca executou</Badge>],
    ["Última rodada do agendador (qualquer origem)", geral ? formatDateTime(geral) : "—"],
    ["Endereço público (APP_URL)", sim(Boolean(process.env.APP_URL), "não definido")], ["Cifra de tokens (TOKEN_ENC_KEY)", sim(cifraDisponivel(), "não definida")],
    ["Segredo do agendador (CRON_SECRET)", sim(Boolean(process.env.CRON_SECRET && process.env.CRON_SECRET.length >= 24), "não definido")], ["Notificações push (VAPID)", sim(pushConfigurado(), "não configurado")],
    ["E-mail (SMTP)", sim(Boolean(process.env.SMTP_HOST), "não configurado")], ["Ambiente", process.env.NODE_ENV ?? "—"],
  ];
  return (
    <Card title="Estado do sistema">
      <dl className="divide-y divide-borda text-sm">{linhas.map(([k, v]) => <div key={k} className="flex flex-wrap items-center justify-between gap-2 py-2"><dt className="text-tinta/70">{k}</dt><dd>{v}</dd></div>)}</dl>
      {negadoRecente && negado && (
        <p role="alert" className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-800">
          {negado.motivo === "nao_configurado"
            ? "O cron chamou o app, mas CRON_SECRET não está definido (ou tem menos de 24 caracteres) na Hostinger."
            : "O cron está chamando o app, mas com o segredo errado (recusado em " + formatDateTime(negado.quando) + "). O valor depois de “Bearer” no comando do cron precisa ser exatamente o CRON_SECRET da Hostinger."}
        </p>
      )}
      {atrasado && !negadoRecente && <p className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">O cron da Hostinger não chamou o app nos últimos 15 minutos. Enquanto isso, o próprio app executa o agendador quando alguém o abre. Confira em hPanel → Cron Jobs se o comando está salvo e ativo.</p>}
      {perms.has("configuracoes:gerir") && (
        <ActionForm action={executarAgendadorAction} submit="Executar agendador agora" resetOnOk={false} className="mt-3">
          <p className="text-xs text-tinta/60">Roda agora a fila de publicações, os lembretes e a coleta. Útil para testar sem esperar o cron.</p>
        </ActionForm>
      )}
      <p className="mt-3 text-xs text-tinta/60">Nomes de variáveis e estados apenas — os valores dos segredos nunca são exibidos.</p>
    </Card>
  );
}
