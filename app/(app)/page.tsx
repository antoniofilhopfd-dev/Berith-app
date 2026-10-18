import Link from "next/link";
import { requireUser } from "@/lib/auth/session";
import { perfisDe, permissoesDe } from "@/lib/permissions";
import { dashboard } from "@/lib/services/painel";
import { Card, Empty, PageHeader, Stat, LinkButton } from "@/components/ui";
import { FormatoTag, RedeTag, RedesTags } from "@/components/pub-ui";
import { Badge } from "@/components/ui";
import { formatDateTime } from "@/lib/format";
import { STATUS_ROTULO, REDE_ROTULO, type Rede } from "@/lib/editorial";
import { brDate } from "@/lib/time";

export const metadata = { title: "Início" };
export const dynamic = "force-dynamic";

const MOTIVO: Record<string, { rotulo: string; tom: "vermelho" | "cobre" | "amarelo" | "azul" }> = {
  atrasada: { rotulo: "Atrasada", tom: "vermelho" }, ajustes: { rotulo: "Ajustes pedidos", tom: "cobre" }, prazo: { rotulo: "Em produção", tom: "azul" }, aprovar: { rotulo: "Aguarda você", tom: "amarelo" },
};

export default async function Inicio() {
  const user = await requireUser();
  const [perfis, perms] = await Promise.all([perfisDe(user.id), permissoesDe(user.id)]);
  if (!perms.has("producao:ver")) {
    return (
      <div className="mx-auto max-w-lg">
        <PageHeader titulo={`Paz e alegria, ${user.nome.split(" ")[0]}!`} />
        <Card><p className="text-sm">Seu acesso ainda não tem um perfil no Ministério de Comunicação. Peça a um administrador para atribuir o seu perfil em <strong>Equipe</strong>. Enquanto isso, você já pode ajustar seu perfil e suas notificações em Configurações.</p>
          <div className="mt-3"><LinkButton href="/configuracoes">Abrir configurações</LinkButton></div></Card>
      </div>
    );
  }
  const d = await dashboard(user.id);
  const variacao = d.publicadasMesAnterior === 0 ? null : Math.round(((d.publicadasMes - d.publicadasMesAnterior) / d.publicadasMesAnterior) * 100);
  const semContas = d.redesConectadas === 0;
  return (
    <div className="space-y-6">
      <PageHeader titulo={`Paz e alegria, ${user.nome.split(" ")[0]}!`} sub={perfis[0] ? undefined : undefined}>
        {perms.has("producao:criar") && <LinkButton href="/producao/nova">Nova produção</LinkButton>}
        {perms.has("calendario:ver") && <LinkButton href="/calendario" sec>Abrir calendário</LinkButton>}
      </PageHeader>

      {d.falhas.length > 0 && (
        <div role="alert" className="rounded-xl border border-red-300 bg-red-50 p-4">
          <p className="font-medium text-red-900">{d.falhas.length} publicação(ões) com falha</p>
          <ul className="mt-2 space-y-1 text-sm text-red-900">{d.falhas.map((f) => <li key={f.id}><RedeTag rede={f.rede} comNome /> · <Link href={`/producao/${f.publicacao_id}`} className="underline">{f.titulo}</Link>{f.ultimo_erro && <span className="block text-xs">{f.ultimo_erro}</span>}</li>)}</ul>
          {perms.has("publicacao:ver") && <Link href="/publicacoes?aba=falhas" className="mt-2 inline-block text-sm underline">Tratar na fila de publicações</Link>}
        </div>
      )}

      <section aria-label="Indicadores" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat rotulo="Publicações programadas" valor={d.totalAgendadas} href="/publicacoes" />
        <Stat rotulo="Aguardando aprovação" valor={d.aguardandoAprovacao.length} href="/aprovacoes" />
        <Stat rotulo="Em produção" valor={d.totalEmProducao} sub={`${d.emProducao.rascunho ?? 0} rascunho(s)`} href="/producao" />
        <Stat rotulo="Publicadas no mês" valor={d.publicadasMes} sub={variacao == null ? "sem mês anterior para comparar" : `${variacao >= 0 ? "+" : ""}${variacao}% vs. mês anterior`} />
      </section>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card title="Próximas publicações" action={perms.has("publicacao:ver") ? <Link href="/publicacoes" className="text-xs underline">ver fila</Link> : undefined}>
            {d.agendadas.length === 0 ? <Empty>Nenhuma publicação agendada.</Empty> : (
              <ul className="divide-y divide-borda">{d.agendadas.map((p) => (
                <li key={p.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm"><span className="w-28 shrink-0 text-tinta/70">{formatDateTime(p.publicar_em)}</span>
                  <Link href={`/producao/${p.id}`} className="font-medium text-verde-escuro hover:underline">{p.titulo}</Link><FormatoTag formato={p.formato} />
                  <RedesTags redes={(p.redes?.split(",") ?? []) as Rede[]} /></li>
              ))}</ul>
            )}
          </Card>
          <Card title="Pendências da equipe">
            {d.pendencias.length === 0 ? <Empty>Sem pendências. Tudo em dia.</Empty> : (
              <ul className="divide-y divide-borda">{d.pendencias.map((p) => (
                <li key={`${p.motivo}-${p.id}`} className="flex flex-wrap items-center gap-2 py-2 text-sm"><Badge tom={MOTIVO[p.motivo].tom}>{MOTIVO[p.motivo].rotulo}</Badge>
                  <Link href={p.motivo === "aprovar" ? `/aprovacoes/${p.id}` : `/producao/${p.id}`} className="font-medium hover:underline">{p.titulo}</Link>
                  <span className="text-xs text-tinta/60">{STATUS_ROTULO[p.status]}{p.prazo ? ` · prazo ${formatDateTime(p.prazo)}` : ""}</span></li>
              ))}</ul>
            )}
          </Card>
          <Card title="Aguardando aprovação" action={<Link href="/aprovacoes" className="text-xs underline">ver todas</Link>}>
            {d.aguardandoAprovacao.length === 0 ? <Empty>Nada aguardando aprovação.</Empty> : <ul className="divide-y divide-borda text-sm">{d.aguardandoAprovacao.map((a) => <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 py-2"><Link href={`/aprovacoes/${a.id}`} className="font-medium hover:underline">{a.titulo}</Link><span className="text-xs text-tinta/60">{a.responsavel_nome ?? "—"} · desde {formatDateTime(a.atualizado_em)}</span></li>)}</ul>}
          </Card>
        </div>
        <div className="space-y-6">
          <Card title="Desempenho (últimos 30 dias)">
            {semContas && d.desempenho.publicacoesComMetricas === 0 ? (
              <p className="text-sm text-tinta/70">Nenhuma rede conectada ainda. As métricas oficiais aparecem aqui depois que as contas forem conectadas em Configurações → Redes sociais.</p>
            ) : d.desempenho.alcance == null ? (
              <p className="text-sm text-tinta/70">Rede conectada, mas ainda sem métricas coletadas. A coleta roda pelo agendador.</p>
            ) : (
              <dl className="space-y-2 text-sm"><div className="flex justify-between"><dt>Alcance</dt><dd className="font-semibold">{d.desempenho.alcance.toLocaleString("pt-BR")}</dd></div>
                <div className="flex justify-between"><dt>Interações</dt><dd className="font-semibold">{(d.desempenho.engajamento ?? 0).toLocaleString("pt-BR")}</dd></div>
                <div className="flex justify-between text-xs text-tinta/60"><dt>Publicações com dados</dt><dd>{d.desempenho.publicacoesComMetricas}</dd></div></dl>
            )}
            {perms.has("relatorios:ver") && <Link href="/relatorios" className="mt-3 inline-block text-sm underline">Abrir relatórios</Link>}
          </Card>
          {d.publicadasPorRede.length > 0 && (
            <Card title="Publicadas no mês, por rede"><ul className="space-y-1 text-sm">{d.publicadasPorRede.map((r) => <li key={r.rede} className="flex justify-between"><span>{REDE_ROTULO[r.rede]}</span><strong>{r.total}</strong></li>)}</ul></Card>
          )}
          <Card title="Próximas datas importantes">
            {d.proximasDatas.length === 0 ? <Empty>Nenhuma data nos próximos 30 dias.</Empty> : <ul className="space-y-1 text-sm">{d.proximasDatas.map((x) => <li key={x.dia + x.nome} className="flex justify-between gap-2"><span>{x.nome}</span><span className="shrink-0 text-tinta/60">{brDate(x.dia).slice(0, 5)}</span></li>)}</ul>}
          </Card>
        </div>
      </div>
    </div>
  );
}
