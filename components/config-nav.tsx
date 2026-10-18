"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function ConfigNav({ itens }: { itens: { href: string; rotulo: string }[] }) {
  const path = usePathname();
  return (
    <nav aria-label="Configurações" className="lg:sticky lg:top-4 lg:self-start">
      <ul className="flex gap-1 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible">
        {itens.map((i) => (
          <li key={i.href} className="shrink-0"><Link href={i.href} aria-current={path === i.href ? "page" : undefined}
            className={`flex min-h-10 items-center whitespace-nowrap rounded-lg px-3 text-sm ${path === i.href ? "bg-verde/10 font-semibold text-verde-escuro" : "text-tinta/80 hover:bg-borda/40"}`}>{i.rotulo}</Link></li>
        ))}
      </ul>
    </nav>
  );
}
