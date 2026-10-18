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

export const metadata = { title: "Configurações gerais" };
export const dynamic = "force-dynamic";

export default async function Geral() {
  const user = await requireUser();
  await exigir(user.id, "configuracoes", "ver");
  const [cfg, mig, ult] = await Promise.all([
    lerConfig(),
    query<RowDataPacket>("SELECT COUNT(*) n, MAX(id) ultima FROM schema_migrations WHERE resultado = 'ok'"),
    query<RowDataPacket>("SELECT valor FROM settings WHERE chave = 'cron_ultima_execucao'"),
  ]);
  const cron = ult[0] ? new Date(String(ult[0].valor)) : null;
  const atrasado = cron ? agoraMs() - cron.getTime() > 15 * 60_000 : true;
  const sim = (ok: boolean, rot: string) => <Badge tom={ok ? "verde" : "amarelo"}>{ok ? "sim" : rot}</Badge>;
  const linhas: [string, React.ReactNode][] = [
    ["Fuso horário", cfg.fusoHorario], ["Banco de dados", `${mig[0].n} migrações aplicadas (última: ${mig[0].ultima ?? "—"})`],
    ["Agendador (cron)", cron ? <span key="c">última execução {formatDateTime(cron)} {atrasado && <Badge tom="amarelo">atrasado</Badge>}</span> : <Badge tom="amarelo">nunca executou</Badge>],
    ["Endereço público (APP_URL)", sim(Boolean(process.env.APP_URL), "não definido")], ["Cifra de tokens (TOKEN_ENC_KEY)", sim(cifraDisponivel(), "não definida")],
    ["Segredo do agendador (CRON_SECRET)", sim(Boolean(process.env.CRON_SECRET && process.env.CRON_SECRET.length >= 24), "não definido")], ["Notificações push (VAPID)", sim(pushConfigurado(), "não configurado")],
    ["E-mail (SMTP)", sim(Boolean(process.env.SMTP_HOST), "não configurado")], ["Ambiente", process.env.NODE_ENV ?? "—"],
  ];
  return (
    <Card title="Estado do sistema">
      <dl className="divide-y divide-borda text-sm">{linhas.map(([k, v]) => <div key={k} className="flex flex-wrap items-center justify-between gap-2 py-2"><dt className="text-tinta/70">{k}</dt><dd>{v}</dd></div>)}</dl>
      <p className="mt-3 text-xs text-tinta/60">Nomes de variáveis e estados apenas — os valores dos segredos nunca são exibidos.</p>
    </Card>
  );
}
