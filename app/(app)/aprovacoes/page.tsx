import Link from "next/link";
import { contaParaFiltro } from "@/lib/auth/conta";
import { requireUser } from "@/lib/auth/session";
import { exigir } from "@/lib/auth/pagina";
import { permissoesDe } from "@/lib/permissions";
import * as P from "@/lib/services/publicacoes";
import { Card, Empty, PageHeader } from "@/components/ui";
import { FormatoTag, RedesTags } from "@/components/pub-ui";
import { formatDateTime } from "@/lib/format";

export const metadata = { title: "Aprovações" };
export const dynamic = "force-dynamic";

export default async function Aprovacoes() {
  const user = await requireUser();
  await exigir(user.id, "aprovacao", "ver");
  const perms = await permissoesDe(user.id);
  const contaId = await contaParaFiltro();
  const [fila, recentes] = await Promise.all([
    P.listar(user.id, { contaId, status: ["em_revisao"] }),
    P.listar(user.id, { contaId, status: ["aprovado", "ajustes_solicitados"], limite: 12 }),
  ]);
  return (
    <div className="space-y-6">
      <PageHeader titulo="Aprovações" sub={perms.has("aprovacao:aprovar") ? "Conteúdos aguardando a sua decisão." : "Conteúdos em revisão (somente consulta)."} />
      {fila.length === 0 ? <Empty>Nada aguardando aprovação. 🎉</Empty> : (
        <ul className="grid gap-3 md:grid-cols-2">
          {fila.map((p) => (
            <li key={p.id}><Card>
              <Link href={`/aprovacoes/${p.id}`} className="text-base font-medium text-verde-escuro hover:underline">{p.titulo}</Link>
              <div className="mt-1 flex flex-wrap items-center gap-2"><FormatoTag formato={p.formato} /><RedesTags redes={p.redes} /></div>
              <p className="mt-1 text-sm text-tinta/70">Responsável: {p.responsavel_nome ?? "—"} · enviado {formatDateTime(p.atualizado_em)}</p>
              {p.publicar_em && <p className="text-sm text-tinta/70">Publicação prevista: {formatDateTime(p.publicar_em)}</p>}
            </Card></li>
          ))}
        </ul>
      )}
      <Card title="Decididos recentemente">
        {recentes.length === 0 ? <Empty>Nenhuma decisão registrada.</Empty> : <ul className="divide-y divide-borda text-sm">{recentes.map((p) => <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2"><Link href={`/producao/${p.id}`} className="underline">{p.titulo}</Link><span className="text-tinta/60">{p.status === "aprovado" ? "Aprovado" : "Ajustes solicitados"} · {formatDateTime(p.atualizado_em)}</span></li>)}</ul>}
      </Card>
    </div>
  );
}
