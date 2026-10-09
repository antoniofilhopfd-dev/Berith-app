import Link from "next/link";
import { requireUser } from "@/lib/auth/session";
import { listMeetings } from "@/lib/services/reunioes";
import { accessibleUnitIds } from "@/lib/permissions";
import { Badge, Card, Empty } from "@/components/ui";
import { formatTime } from "@/lib/format";
import { brDate, utcToLocal } from "@/lib/time";
import { Plus } from "lucide-react";

export default async function Reunioes() {
  const user = await requireUser();
  const [lista, criar] = await Promise.all([listMeetings(user.id), accessibleUnitIds(user.id, "reunioes", "criar")]);
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="font-titulo text-2xl text-verde">Reuniões</h1>
        {(criar === "todas" || criar.length > 0) && <Link href="/reunioes/nova" className="inline-flex min-h-11 items-center gap-1 rounded-lg bg-verde px-3 text-sm text-white"><Plus size={16} aria-hidden /> Nova</Link>}
      </div>
      <Card>
        {lista.length === 0 ? <Empty>Nenhuma reunião para você.</Empty> : (
          <ul className="divide-y divide-borda">
            {lista.map((m) => (
              <li key={m.id}><Link href={`/reunioes/${m.id}`} className="flex min-h-14 items-center justify-between gap-2 py-2">
                <span><span className="font-medium">{m.titulo}</span><span className="block text-xs text-tinta/60">{brDate(utcToLocal(m.inicio).date)} · {formatTime(m.inicio)} · {m.unit_nome}</span></span>
                <Badge>{m.status}</Badge>
              </Link></li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
