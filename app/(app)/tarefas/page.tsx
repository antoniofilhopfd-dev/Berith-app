import Link from "next/link";
import { requireUser } from "@/lib/auth/session";
import { listTasks, type Tarefa } from "@/lib/services/tarefas";
import { accessibleUnitIds } from "@/lib/permissions";
import { Badge, Card, Empty } from "@/components/ui";
import { brDate } from "@/lib/time";
import { STATUS_LABEL } from "@/lib/format";
import { Plus } from "lucide-react";

function Item({ t }: { t: Tarefa }) {
  return (
    <li>
      <Link href={`/tarefas/${t.id}`} className="block min-h-14 py-2">
        <span className="flex flex-wrap items-center gap-2">
          <span className={`font-medium ${t.status === "concluida" || t.status === "cancelada" ? "text-tinta/50 line-through" : ""}`}>{t.titulo}</span>
          {t.prioridade === "alta" && <Badge>alta</Badge>}
          {Number(t.atrasada) === 1 && <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs text-red-800">atrasada</span>}
        </span>
        <span className="block text-xs text-tinta/60">{STATUS_LABEL[t.status]} · {t.unit_nome}{t.prazo && ` · prazo ${brDate(t.prazo)}`}{t.responsavel_nome && ` · ${t.responsavel_nome}`}</span>
      </Link>
    </li>
  );
}

export default async function Tarefas({ searchParams }: { searchParams: Promise<{ s?: string; v?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const v = sp.v === "estruturas" ? "estruturas" : "minhas";
  const status = ["aberta", "em_andamento", "concluida", "cancelada"].includes(sp.s ?? "") ? sp.s : undefined;
  const [lista, podeCriar] = await Promise.all([listTasks(user.id, v, status), accessibleUnitIds(user.id, "tarefas", "criar")]);
  const link = (o: { v?: string; s?: string }) => `?v=${o.v ?? v}${(o.s ?? status) ? `&s=${o.s ?? status}` : ""}`;
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="font-titulo text-2xl text-vinho">Tarefas</h1>
        {(podeCriar === "todas" || podeCriar.length > 0) && <Link href="/tarefas/nova" className="inline-flex min-h-11 items-center gap-1 rounded-lg bg-vinho px-3 text-sm text-white"><Plus size={16} aria-hidden /> Nova</Link>}
      </div>
      <div role="tablist" className="flex gap-1 rounded-xl bg-vinho/10 p-1">
        {[["minhas", "Minhas"], ["estruturas", "Das estruturas"]].map(([k, l]) => (
          <Link key={k} role="tab" aria-selected={v === k} href={`?v=${k}${status ? `&s=${status}` : ""}`} className={`min-h-11 flex-1 content-center rounded-lg text-center text-sm ${v === k ? "bg-vinho text-white" : "text-vinho"}`}>{l}</Link>
        ))}
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1" aria-label="Filtrar por situação">
        {[["", "Todas"], ["aberta", "Abertas"], ["em_andamento", "Em andamento"], ["concluida", "Concluídas"]].map(([k, l]) => (
          <Link key={k} href={k ? link({ s: k }) : `?v=${v}`} className={`min-h-11 shrink-0 content-center rounded-full border px-4 text-sm ${(status ?? "") === k ? "border-vinho bg-vinho text-white" : "border-borda"}`}>{l}</Link>
        ))}
      </div>
      <Card>{lista.length === 0 ? <Empty>Nenhuma tarefa por aqui.</Empty> : <ul className="divide-y divide-borda">{lista.map((t) => <Item key={t.id} t={t} />)}</ul>}</Card>
    </div>
  );
}
