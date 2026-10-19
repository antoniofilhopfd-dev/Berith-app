import Link from "next/link";
import { LogOut, Bell } from "lucide-react";
import { requireUser } from "@/lib/auth/session";
import { logoutAction } from "@/lib/auth/actions";
import { perfisDe, permissoesDe, PERFIL_ROTULO } from "@/lib/permissions";
import { itensVisiveis } from "@/lib/nav";
import { ICONES } from "@/components/icones";
import { naoLidas } from "@/lib/services/notificacoes";

export const metadata = { title: "Menu" };

/** Menu do aplicativo no celular: perfil, todas as seções em blocos com ícone e saída. */
export default async function Mais() {
  const user = await requireUser();
  const [perms, perfis, notif] = await Promise.all([permissoesDe(user.id), perfisDe(user.id), naoLidas(user.id)]);
  const itens = itensVisiveis(perms).filter((i) => i.href !== "/");
  const inicial = user.nome.trim().charAt(0).toUpperCase() || "?";
  return (
    <div className="space-y-5">
      <Link href="/configuracoes/perfil" className="flex items-center gap-3 rounded-2xl border border-borda bg-cartao p-4 active:bg-fundo">
        <span aria-hidden className="flex h-12 w-12 items-center justify-center rounded-full bg-verde text-xl font-semibold text-white">{inicial}</span>
        <span className="min-w-0 flex-1"><span className="block truncate font-semibold">{user.nome}</span><span className="block truncate text-sm text-tinta/60">{perfis[0] ? PERFIL_ROTULO[perfis[0]] : "Sem perfil de acesso"}</span></span>
        <span className="text-sm text-verde-escuro">Meu perfil</span>
      </Link>
      <ul className="grid grid-cols-3 gap-3 sm:grid-cols-4">
        {itens.map((i) => {
          const Icon = ICONES[i.icone as keyof typeof ICONES];
          return (
            <li key={i.href}><Link href={i.href} className="flex min-h-24 flex-col items-center justify-center gap-2 rounded-2xl border border-borda bg-cartao p-2 text-center text-xs font-medium text-verde-escuro active:bg-fundo">
              <Icon size={26} aria-hidden /><span className="leading-tight">{i.rotulo}</span></Link></li>
          );
        })}
        <li><Link href="/notificacoes" className="relative flex min-h-24 flex-col items-center justify-center gap-2 rounded-2xl border border-borda bg-cartao p-2 text-center text-xs font-medium text-verde-escuro active:bg-fundo">
          <Bell size={26} aria-hidden /><span>Notificações</span>{notif > 0 && <span className="absolute right-2 top-2 min-w-5 rounded-full bg-cobre px-1.5 text-center text-xs text-white">{notif}</span>}</Link></li>
      </ul>
      <form action={logoutAction}>
        <button className="flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl border border-red-200 bg-white font-medium text-red-800 active:bg-red-50"><LogOut size={18} aria-hidden /> Sair do app</button>
      </form>
      <p className="text-center text-xs text-tinta/50"><Link href="/privacidade" className="underline">Aviso de privacidade</Link></p>
    </div>
  );
}
