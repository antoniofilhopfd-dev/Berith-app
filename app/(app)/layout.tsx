import { redirect } from "next/navigation";
import Link from "next/link";
import { getSessionUser } from "@/lib/auth/session";
import { logoutAction } from "@/lib/auth/actions";
import { accessibleUnitIds, can } from "@/lib/permissions";
import { Home, Network, Users, UserCircle } from "lucide-react";

export const dynamic = "force-dynamic";

async function temAcesso(uid: number, r: "estruturas" | "membros", a: "ver" | "aprovar" | "criar") {
  const ids = await accessibleUnitIds(uid, r, a);
  return ids === "todas" || ids.length > 0;
}

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const [est, mem, memAprov, memCriar, admin] = await Promise.all([
    temAcesso(user.id, "estruturas", "ver"), temAcesso(user.id, "membros", "ver"),
    temAcesso(user.id, "membros", "aprovar"), temAcesso(user.id, "membros", "criar"),
    can(user.id, "estruturas", "criar"),
  ]);
  const itens = [
    { href: "/", label: "Início", icon: Home, show: true },
    { href: "/estruturas", label: "Estruturas", icon: Network, show: est || admin },
    { href: "/membros", label: "Membros", icon: Users, show: mem || memAprov || memCriar },
    { href: "/perfil", label: "Perfil", icon: UserCircle, show: true },
  ].filter((i) => i.show);
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col pb-20">
      <header className="sticky top-0 z-10 flex items-center justify-between bg-vinho px-4 py-3 text-white">
        <span className="font-titulo text-lg">Nova Berith</span>
        <form action={logoutAction}>
          <button className="min-h-11 rounded-lg px-3 text-sm hover:bg-white/10">Sair</button>
        </form>
      </header>
      <main className="flex-1 px-4 py-6">{children}</main>
      <nav aria-label="Principal" className="fixed inset-x-0 bottom-0 z-10 border-t border-borda bg-white">
        <ul className="mx-auto flex max-w-3xl">
          {itens.map(({ href, label, icon: Icon }) => (
            <li key={href} className="flex-1">
              <Link href={href} className="flex min-h-14 flex-col items-center justify-center gap-0.5 text-xs text-vinho">
                <Icon size={20} aria-hidden /> {label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
