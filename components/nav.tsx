"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Lightbulb, CalendarDays, KanbanSquare, CheckCircle2, Send, Image as ImageIcon, BarChart3, Users, Settings, Menu } from "lucide-react";
import { ativo, type ItemNav } from "@/lib/nav";

const ICONES = { home: Home, lightbulb: Lightbulb, calendar: CalendarDays, kanban: KanbanSquare, check: CheckCircle2, send: Send, image: ImageIcon, chart: BarChart3, users: Users, settings: Settings } as const;

export function SidebarNav({ itens, badges }: { itens: ItemNav[]; badges: Record<string, number> }) {
  const path = usePathname();
  return (
    <nav aria-label="Principal">
      <ul className="space-y-0.5">
        {itens.map((i) => {
          const Icon = ICONES[i.icone as keyof typeof ICONES];
          const on = ativo(i.href, path);
          const b = badges[i.href] ?? 0;
          return (
            <li key={i.href}>
              <Link href={i.href} aria-current={on ? "page" : undefined}
                className={`flex min-h-10 items-center gap-3 rounded-lg px-3 text-sm ${on ? "bg-white/15 font-semibold text-white" : "text-white/80 hover:bg-white/10 hover:text-white"}`}>
                <Icon size={18} aria-hidden /> <span className="flex-1">{i.rotulo}</span>
                {b > 0 && <span className="min-w-5 rounded-full bg-cobre px-1.5 text-center text-xs text-white" aria-label={`${b} pendente(s)`}>{b}</span>}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** Barra inferior (celular/tablet): atalhos principais + "Mais" com o restante do menu. */
export function BottomNav({ itens, badges }: { itens: ItemNav[]; badges: Record<string, number> }) {
  const path = usePathname();
  const principais = itens.filter((i) => i.principal).slice(0, 4);
  return (
    <nav aria-label="Principal (celular)" className="fixed inset-x-0 bottom-0 z-20 border-t border-borda bg-white lg:hidden">
      <ul className="mx-auto flex max-w-3xl">
        {principais.map((i) => {
          const Icon = ICONES[i.icone as keyof typeof ICONES];
          const on = ativo(i.href, path);
          const b = badges[i.href] ?? 0;
          return (
            <li key={i.href} className="flex-1">
              <Link href={i.href} aria-current={on ? "page" : undefined} className={`flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] ${on ? "font-semibold text-verde-escuro" : "text-tinta/70"}`}>
                <span className="relative"><Icon size={20} aria-hidden />{b > 0 && <span className="absolute -right-2 -top-1 min-w-4 rounded-full bg-cobre px-1 text-center text-[10px] text-white" aria-label={`${b} pendente(s)`}>{b}</span>}</span>
                {i.rotulo}
              </Link>
            </li>
          );
        })}
        <li className="flex-1">
          <Link href="/mais" aria-current={path === "/mais" ? "page" : undefined} className={`flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] ${path === "/mais" ? "font-semibold text-verde-escuro" : "text-tinta/70"}`}>
            <Menu size={20} aria-hidden /> Mais
          </Link>
        </li>
      </ul>
    </nav>
  );
}
