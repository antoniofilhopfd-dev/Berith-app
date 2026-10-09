import Link from "next/link";
import { requireUser } from "@/lib/auth/session";
import { listOccurrences } from "@/lib/services/eventos";
import { listForUser } from "@/lib/services/comunicados";
import { getPerson } from "@/lib/services/membros";
import { Badge, Card, Empty } from "@/components/ui";
import { OcorrenciaItem, agruparPorDia, tituloDia } from "@/components/evento-ui";
import { TIPO_LABEL } from "@/lib/format";

export default async function Inicio() {
  const user = await requireUser();
  const agora = new Date();
  const [ocs, avisos, perfil] = await Promise.all([
    listOccurrences(user.id, agora, new Date(agora.getTime() + 30 * 86400_000), 100),
    listForUser(user.id, 20),
    getPerson(user.id, user.id),
  ]);
  const proximos = ocs.filter((o) => !o.cancelada).slice(0, 5);
  const naoLidos = avisos.filter((a) => !a.lido_em);
  const vinculos = perfil.vinculos.filter((v) => !v.fim);
  return (
    <section className="space-y-4">
      <h1 className="font-titulo text-2xl text-vinho">Paz e bem, {user.nome.split(" ")[0]}!</h1>

      <Card title="Comunicados">
        {naoLidos.length === 0 ? <Empty>Nenhum comunicado novo para você.</Empty> : (
          <ul className="divide-y divide-borda">
            {naoLidos.slice(0, 3).map((a) => (
              <li key={a.id}>
                <Link href={`/comunicados/${a.id}`} className="block min-h-12 py-2">
                  <span className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-vinho" /><span className="font-medium">{a.titulo}</span>{a.prioridade !== "normal" && <Badge>{a.prioridade}</Badge>}</span>
                  <span className="line-clamp-1 text-sm text-tinta/60">{a.corpo}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
        {naoLidos.length > 3 && <Link href="/comunicados" className="mt-2 inline-block text-sm text-vinho underline">Ver todos ({naoLidos.length} não lidos)</Link>}
      </Card>

      <Card title="Próximos eventos">
        {proximos.length === 0 ? <Empty>Nenhum evento disponível para você nos próximos 30 dias.</Empty> : (
          agruparPorDia(proximos).map(([dia, itens]) => (
            <div key={dia} className="mb-2">
              <p className="text-xs font-medium uppercase tracking-wide text-tinta/60">{tituloDia(dia)}</p>
              <ul className="divide-y divide-borda">{itens.map((o) => <OcorrenciaItem key={o.evento.id + o.date} o={o} />)}</ul>
            </div>
          ))
        )}
        <Link href="/eventos" className="text-sm text-vinho underline">Abrir agenda</Link>
      </Card>

      <Card title="Minhas estruturas">
        {vinculos.length === 0 ? <Empty>Você ainda não está vinculado(a) a nenhuma estrutura.</Empty> : (
          <ul className="flex flex-wrap gap-2">{vinculos.map((v) => <li key={v.id}><Badge>{TIPO_LABEL[v.tipo]}: {v.nome}</Badge></li>)}</ul>
        )}
      </Card>
    </section>
  );
}
