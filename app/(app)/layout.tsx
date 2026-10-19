import { redirect } from "next/navigation";
import { after } from "next/server";
import Image from "next/image";
import Link from "next/link";
import { getSessionUser } from "@/lib/auth/session";
import { logoutAction } from "@/lib/auth/actions";
import { Bell, LogOut } from "lucide-react";
import { naoLidas } from "@/lib/services/notificacoes";
import { permissoesDe, perfisDe, PERFIL_ROTULO } from "@/lib/permissions";
import { itensVisiveis } from "@/lib/nav";
import { BottomNav, SidebarNav } from "@/components/nav";
import { contagensMenu } from "@/lib/services/painel";
import { garantirAgendador } from "@/lib/services/agendador";
import { contasInstagram } from "@/lib/integracoes/contas";
import { contaPreferida } from "@/lib/auth/conta";
import { SeletorConta } from "@/components/seletor-conta";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  after(garantirAgendador); // rede de segurança caso o cron externo falhe
  const [notif, perms, perfis] = await Promise.all([naoLidas(user.id), permissoesDe(user.id), perfisDe(user.id)]);
  const itens = itensVisiveis(perms);
  const badges = await contagensMenu(user.id, perms);
  const contasIg = await contasInstagram();
  const preferida = await contaPreferida();
  const contaAtual = (contasIg.find((c) => c.igId === preferida) ?? contasIg.find((c) => c.principal) ?? contasIg[0])?.igId ?? "";
  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[16rem_minmax(0,1fr)]">
      <a href="#conteudo" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-white focus:px-3 focus:py-2">Pular para o conteúdo</a>
      <aside className="hidden bg-lateral px-3 py-4 text-white lg:sticky lg:top-0 lg:flex lg:h-dvh lg:flex-col">
        <Link href="/" aria-label="Berith — início" className="mb-5 block px-2"><Image src="/brand/logo-branco.png" alt="Nova Berith — Comunidade Católica" width={900} height={544} priority className="h-[56px] w-auto" /></Link>
        <p className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-wider text-white/60">Ministério de Comunicação</p>
        <div className="flex-1 overflow-y-auto"><SidebarNav itens={itens} badges={badges} /></div>
        <div className="mt-3 border-t border-white/15 pt-3 text-sm">
          <p className="truncate px-3 font-medium">{user.nome}</p>
          <p className="truncate px-3 text-xs text-white/60">{perfis[0] ? PERFIL_ROTULO[perfis[0]] : "Sem perfil de acesso"}</p>
          <div className="mt-2 flex items-center gap-1 px-1 text-white">
            <Link href="/notificacoes" aria-label={notif ? `Notificações: ${notif} não lida(s)` : "Notificações"} className="relative flex min-h-10 min-w-10 items-center justify-center rounded-lg hover:bg-white/10"><Bell size={18} aria-hidden />{notif > 0 && <span className="absolute right-0.5 top-0.5 min-w-4 rounded-full bg-cobre px-1 text-center text-[10px]">{notif}</span>}</Link>
            <form action={logoutAction}><button className="flex min-h-10 items-center gap-2 rounded-lg px-3 hover:bg-white/10"><LogOut size={16} aria-hidden /> Sair</button></form>
          </div>
        </div>
      </aside>
      <div className="flex min-h-dvh min-w-0 flex-col pb-16 lg:pb-0">
        <header className="sticky top-0 z-10 flex items-center justify-between bg-lateral px-4 py-2 text-white lg:hidden">
          <Link href="/" aria-label="Berith — início" className="flex min-h-10 items-center"><Image src="/brand/logo-branco.png" alt="Nova Berith — Comunidade Católica" width={900} height={544} priority className="h-[44px] w-auto" /></Link>
          <div className="flex items-center text-white">
            <Link href="/notificacoes" aria-label={notif ? `Notificações: ${notif} não lida(s)` : "Notificações"} className="relative flex min-h-10 min-w-10 items-center justify-center rounded-lg hover:bg-white/10"><Bell size={20} aria-hidden />{notif > 0 && <span className="absolute right-0.5 top-0.5 min-w-4 rounded-full bg-cobre px-1 text-center text-[10px]">{notif}</span>}</Link>
            <form action={logoutAction}><button className="min-h-10 rounded-lg px-3 text-sm hover:bg-white/10">Sair</button></form>
          </div>
        </header>
        {contasIg.length > 0 && perms.has("relatorios:ver") && (
          <div className="no-print mx-auto flex w-full max-w-6xl justify-end px-4 pt-4 lg:px-8"><SeletorConta contas={contasIg} atual={contaAtual} /></div>
        )}
        <main id="conteudo" className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 lg:px-8">{children}</main>
      </div>
      <BottomNav itens={itens} badges={badges} />
    </div>
  );
}
