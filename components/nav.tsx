"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { Bell, ChevronLeft, Menu } from "lucide-react";
import { ativo, type ItemNav } from "@/lib/nav";
import { ICONES } from "@/components/icones";

/** Menu lateral: completo no computador (lg) e só ícones com legenda no tablet (md). */
export function SidebarNav({ itens, badges }: { itens: ItemNav[]; badges: Record<string, number> }) {
  const path = usePathname();
  return (
    <nav aria-label="Principal" className="app-chrome">
      <ul className="space-y-0.5">
        {itens.map((i) => {
          const Icon = ICONES[i.icone as keyof typeof ICONES];
          const on = ativo(i.href, path);
          const b = badges[i.href] ?? 0;
          return (
            <li key={i.href}>
              <Link href={i.href} aria-current={on ? "page" : undefined} aria-label={i.rotulo} title={i.rotulo}
                className={`relative flex min-h-12 items-center rounded-xl text-sm transition-colors lg:min-h-10 lg:gap-3 lg:px-3 max-lg:flex-col max-lg:justify-center max-lg:gap-0.5 max-lg:px-1 max-lg:py-1.5 ${on ? "bg-white/15 font-semibold text-white" : "text-white/80 hover:bg-white/10 hover:text-white"}`}>
                <Icon size={20} aria-hidden className="shrink-0" />
                <span className="hidden flex-1 lg:inline">{i.rotulo}</span>
                <span aria-hidden className="max-w-full truncate text-[10px] leading-tight lg:hidden">{i.curto ?? i.rotulo}</span>
                {b > 0 && <span className="absolute right-1 top-1 min-w-5 rounded-full bg-cobre px-1.5 text-center text-xs text-white lg:static lg:ml-auto" aria-label={`${b} pendente(s)`}>{b}</span>}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** Barra inferior (celular): atalhos principais + "Mais". Respeita a área segura do aparelho. */
export function BottomNav({ itens, badges }: { itens: ItemNav[]; badges: Record<string, number> }) {
  const path = usePathname();
  const principais = itens.filter((i) => i.principal).slice(0, 4);
  const emMais = !principais.some((i) => ativo(i.href, path));
  return (
    <nav aria-label="Principal (celular)" className="app-chrome pb-safe pl-safe pr-safe fixed inset-x-0 bottom-0 z-20 border-t border-borda bg-white/95 backdrop-blur md:hidden">
      <ul className="mx-auto flex max-w-xl">
        {principais.map((i) => {
          const Icon = ICONES[i.icone as keyof typeof ICONES];
          const on = ativo(i.href, path);
          const b = badges[i.href] ?? 0;
          return (
            <li key={i.href} className="flex-1">
              <Link href={i.href} aria-current={on ? "page" : undefined} className={`flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] ${on ? "font-semibold text-verde-escuro" : "text-tinta/70"}`}>
                <span className={`relative flex h-7 w-12 items-center justify-center rounded-full transition-colors ${on ? "bg-verde/15" : ""}`}><Icon size={20} aria-hidden />{b > 0 && <span className="absolute right-0 top-0 min-w-4 rounded-full bg-cobre px-1 text-center text-[10px] text-white" aria-label={`${b} pendente(s)`}>{b}</span>}</span>
                {i.rotulo}
              </Link>
            </li>
          );
        })}
        <li className="flex-1">
          <Link href="/mais" aria-current={path === "/mais" ? "page" : undefined} className={`flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] ${path === "/mais" || emMais ? "font-semibold text-verde-escuro" : "text-tinta/70"}`}>
            <span className={`flex h-7 w-12 items-center justify-center rounded-full ${path === "/mais" || emMais ? "bg-verde/15" : ""}`}><Menu size={20} aria-hidden /></span> Mais
          </Link>
        </li>
      </ul>
    </nav>
  );
}

const TITULOS_EXTRAS: Record<string, string> = { "/notificacoes": "Notificações", "/mais": "Menu", "/privacidade": "Privacidade" };

/** Barra superior do celular: título da seção, botão voltar nas telas internas, notificações e menu. */
export function AppBar({ itens, notif }: { itens: ItemNav[]; notif: number }) {
  const path = usePathname();
  const raiz = "/" + (path.split("/")[1] ?? "");
  const principal = path === "/";
  const interna = !principal && path.split("/").filter(Boolean).length > 1;
  const titulo = principal ? "Berith" : (itens.find((i) => i.href === raiz)?.rotulo ?? TITULOS_EXTRAS[raiz] ?? "Berith");
  return (
    <header className="app-chrome pt-safe pl-safe pr-safe sticky top-0 z-20 bg-lateral text-white md:hidden">
      <div className="flex h-14 items-center gap-1 px-2">
        {interna
          ? <Link href={raiz} aria-label={`Voltar para ${titulo}`} className="flex h-11 w-11 items-center justify-center rounded-full active:bg-white/15"><ChevronLeft size={26} aria-hidden /></Link>
          : <Link href="/" aria-label="Berith — início" className="flex h-11 w-11 items-center justify-center"><Image src="/icons/icon-48.png" alt="" width={32} height={32} className="rounded-lg" /></Link>}
        <p className="min-w-0 flex-1 truncate text-lg font-semibold">{titulo}</p>
        <Link href="/notificacoes" aria-label={notif ? `Notificações: ${notif} não lida(s)` : "Notificações"} className="relative flex h-11 w-11 items-center justify-center rounded-full active:bg-white/15"><Bell size={22} aria-hidden />{notif > 0 && <span className="absolute right-1 top-1 min-w-4 rounded-full bg-cobre px-1 text-center text-[10px]">{notif}</span>}</Link>
      </div>
    </header>
  );
}
