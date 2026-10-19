import Link from "next/link";

const ABAS = [
  { chave: "geral", href: "/relatorios", rotulo: "Visão geral" },
  { chave: "publicacoes", href: "/relatorios/publicacoes", rotulo: "Publicações" },
  { chave: "ranking", href: "/relatorios/ranking", rotulo: "Ranking e seguidores" },
  { chave: "mensal", href: "/relatorios/mensal", rotulo: "Relatório mensal" },
] as const;

/** Abas do módulo Relatórios. A conta vem do seletor do topo (cookie), não da URL. */
export function RelNav({ atual }: { atual: (typeof ABAS)[number]["chave"]; conta?: string | null }) {
  return (
    <nav aria-label="Seções de relatórios" className="no-print flex flex-wrap gap-2">
      {ABAS.map((a) => (
        <Link key={a.chave} href={a.href} aria-current={atual === a.chave ? "page" : undefined}
          className={`rounded-full border px-4 py-1.5 text-sm font-medium ${atual === a.chave ? "border-verde bg-verde text-white" : "border-borda bg-white hover:bg-fundo"}`}>{a.rotulo}</Link>
      ))}
    </nav>
  );
}
