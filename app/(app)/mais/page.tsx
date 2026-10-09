import Link from "next/link";
import { requireUser } from "@/lib/auth/session";
import { accessibleUnitIds, can } from "@/lib/permissions";
import { Card } from "@/components/ui";
import { CalendarClock, Users, Network, UserCircle, ChevronRight, ClipboardList } from "lucide-react";
import { logoutAction } from "@/lib/auth/actions";

async function tem(uid: number, r: "estruturas" | "membros", a: "ver" | "criar" | "aprovar") {
  const ids = await accessibleUnitIds(uid, r, a);
  return ids === "todas" || ids.length > 0;
}

export default async function Mais() {
  const user = await requireUser();
  const [estruturas, membros, aprov, criar, admin] = await Promise.all([
    tem(user.id, "estruturas", "ver"), tem(user.id, "membros", "ver"),
    tem(user.id, "membros", "aprovar"), tem(user.id, "membros", "criar"), can(user.id, "estruturas", "criar"),
  ]);
  const itens = [
    { href: "/escalas", label: "Escalas de serviço", icon: ClipboardList, show: true },
    { href: "/reunioes", label: "Reuniões", icon: CalendarClock, show: true },
    { href: "/estruturas", label: "Estruturas", icon: Network, show: estruturas || admin },
    { href: "/membros", label: "Membros", icon: Users, show: membros || aprov || criar },
    { href: "/perfil", label: "Meu perfil", icon: UserCircle, show: true },
  ].filter((i) => i.show);
  return (
    <div className="space-y-4">
      <h1 className="font-titulo text-2xl text-vinho">Mais</h1>
      <Card className="p-0">
        <ul className="divide-y divide-borda">
          {itens.map(({ href, label, icon: Icon }) => (
            <li key={href}><Link href={href} className="flex min-h-14 items-center gap-3 px-4"><Icon size={20} className="text-vinho" aria-hidden /><span className="flex-1">{label}</span><ChevronRight size={18} className="text-tinta/40" aria-hidden /></Link></li>
          ))}
        </ul>
      </Card>
      <form action={logoutAction}><button className="min-h-11 w-full rounded-lg border border-borda bg-white text-sm text-vinho">Sair da conta</button></form>
    </div>
  );
}
