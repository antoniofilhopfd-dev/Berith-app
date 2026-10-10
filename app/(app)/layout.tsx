import { redirect } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { getSessionUser } from "@/lib/auth/session";
import { logoutAction } from "@/lib/auth/actions";
import { Home, CalendarDays, Megaphone, ListChecks, Menu, Bell } from "lucide-react";
import { unreadCount } from "@/lib/services/comunicados";
import { myOpenCount } from "@/lib/services/tarefas";
import { naoLidas } from "@/lib/services/notificacoes";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const [nao, tarefas, notif] = await Promise.all([unreadCount(user.id), myOpenCount(user.id), naoLidas(user.id)]);
  const itens = [
    { href: "/", label: "Início", icon: Home, badge: 0 },
    { href: "/eventos", label: "Agenda", icon: CalendarDays, badge: 0 },
    { href: "/comunicados", label: "Avisos", icon: Megaphone, badge: nao },
    { href: "/tarefas", label: "Tarefas", icon: ListChecks, badge: tarefas },
    { href: "/mais", label: "Mais", icon: Menu, badge: 0 },
  ];
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col pb-20">
      <header className="sticky top-0 z-10 flex items-center justify-between bg-verde px-4 py-2 text-white">
        <Link href="/" aria-label="Nova Berith — início" className="flex min-h-11 items-center"><Image src="/brand/logo-branco.png" alt="Nova Berith — Comunidade Católica" width={900} height={544} priority className="h-[60px] w-auto" /></Link>
        <div className="flex items-center">
          <Link href="/notificacoes" aria-label={notif ? `Notificações: ${notif} não lida(s)` : "Notificações"} className="relative flex min-h-11 min-w-11 items-center justify-center rounded-lg hover:bg-white/10">
            <Bell size={22} aria-hidden />{notif > 0 && <span className="absolute right-1 top-1 min-w-4 rounded-full bg-cobre px-1 text-center text-[10px] text-white">{notif}</span>}
          </Link>
          <form action={logoutAction}><button className="min-h-11 rounded-lg px-3 text-sm hover:bg-white/10">Sair</button></form>
        </div>
      </header>
      <main className="flex-1 px-4 py-6">{children}</main>
      <nav aria-label="Principal" className="fixed inset-x-0 bottom-0 z-10 border-t border-borda bg-white">
        <ul className="mx-auto flex max-w-3xl">
          {itens.map(({ href, label, icon: Icon, badge }) => (
            <li key={href} className="flex-1">
              <Link href={href} className="flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] text-verde">
                <span className="relative"><Icon size={20} aria-hidden />{badge ? <span className="absolute -right-2 -top-1 min-w-4 rounded-full bg-verde px-1 text-center text-[10px] text-white" aria-label={`${badge} não lido(s)`}>{badge}</span> : null}</span> {label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
