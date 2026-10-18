import type { Acao, Recurso } from "@/lib/permissions";

export type ItemNav = { href: string; rotulo: string; icone: string; req?: [Recurso, Acao]; principal?: boolean };

/** Menu único do aplicativo. `req` define quem enxerga o item (o servidor revalida em cada página e ação). */
export const NAV: ItemNav[] = [
  { href: "/", rotulo: "Início", icone: "home", principal: true },
  { href: "/planejamento", rotulo: "Planejamento", icone: "lightbulb", req: ["planejamento", "ver"] },
  { href: "/calendario", rotulo: "Calendário", icone: "calendar", req: ["calendario", "ver"], principal: true },
  { href: "/producao", rotulo: "Produção", icone: "kanban", req: ["producao", "ver"], principal: true },
  { href: "/aprovacoes", rotulo: "Aprovações", icone: "check", req: ["aprovacao", "ver"], principal: true },
  { href: "/publicacoes", rotulo: "Publicações", icone: "send", req: ["publicacao", "ver"] },
  { href: "/midia", rotulo: "Biblioteca de mídia", icone: "image", req: ["midia", "ver"] },
  { href: "/relatorios", rotulo: "Relatórios", icone: "chart", req: ["relatorios", "ver"] },
  { href: "/equipe", rotulo: "Equipe", icone: "users", req: ["equipe", "ver"] },
  { href: "/configuracoes", rotulo: "Configurações", icone: "settings" },
];

export function itensVisiveis(perms: Set<string>): ItemNav[] {
  return NAV.filter((i) => !i.req || perms.has(`${i.req[0]}:${i.req[1]}`));
}

export function ativo(href: string, pathname: string): boolean {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(href + "/");
}
