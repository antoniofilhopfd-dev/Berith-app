import Link from "next/link";

export function Card({ title, children, className = "", action }: { title?: string; children: React.ReactNode; className?: string; action?: React.ReactNode }) {
  return (
    <section className={`rounded-xl border border-borda bg-cartao p-4 ${className}`}>
      {(title || action) && (
        <div className="mb-3 flex items-center justify-between gap-2">
          {title && <h2 className="text-sm font-semibold uppercase tracking-wide text-tinta/70">{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function PageHeader({ titulo, sub, children }: { titulo: string; sub?: string; children?: React.ReactNode }) {
  return (
    <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="font-titulo text-xl text-verde-escuro md:text-2xl">{titulo}</h1>
        {sub && <p className="mt-0.5 text-sm text-tinta/70">{sub}</p>}
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </header>
  );
}

export const Badge = ({ children, tom = "verde" }: { children: React.ReactNode; tom?: "verde" | "cobre" | "cinza" | "vermelho" | "azul" | "amarelo" }) => {
  const c = {
    verde: "bg-verde/10 text-verde-escuro", cobre: "bg-cobre/15 text-marrom", cinza: "bg-tinta/10 text-tinta/80",
    vermelho: "bg-red-100 text-red-800", azul: "bg-sky-100 text-sky-800", amarelo: "bg-amber-100 text-amber-900",
  }[tom];
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${c}`}>{children}</span>;
};

export const Empty = ({ children }: { children: React.ReactNode }) => <p className="rounded-lg border border-dashed border-borda p-4 text-center text-sm text-tinta/60">{children}</p>;

export const btn = "inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-verde px-4 text-sm font-medium text-white hover:bg-verde-escuro focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-verde disabled:opacity-60";
export const btnSec = "inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-borda bg-white px-4 text-sm font-medium text-tinta hover:bg-fundo focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-verde";

export function LinkButton({ href, children, sec = false }: { href: string; children: React.ReactNode; sec?: boolean }) {
  return <Link href={href} className={sec ? btnSec : btn}>{children}</Link>;
}

/** Abas por rota: o item ativo é marcado pelo chamador (sem JavaScript no cliente). */
export function Tabs({ itens, ativo, label = "Seções" }: { itens: { href: string; rotulo: string; chave: string }[]; ativo: string; label?: string }) {
  return (
    <nav aria-label={label} className="mb-4 flex gap-1 overflow-x-auto border-b border-borda">
      {itens.map((i) => (
        <Link key={i.chave} href={i.href} aria-current={i.chave === ativo ? "page" : undefined}
          className={`-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm ${i.chave === ativo ? "border-verde font-semibold text-verde-escuro" : "border-transparent text-tinta/70 hover:text-tinta"}`}>{i.rotulo}</Link>
      ))}
    </nav>
  );
}

export function Stat({ rotulo, valor, sub, href, tom }: { rotulo: string; valor: React.ReactNode; sub?: string; href?: string; tom?: "alerta" }) {
  const corpo = (
    <div className={`rounded-xl border bg-cartao p-4 ${tom === "alerta" ? "border-red-300" : "border-borda"} ${href ? "hover:border-verde" : ""}`}>
      <p className="text-xs font-medium uppercase tracking-wide text-tinta/60">{rotulo}</p>
      <p className={`mt-1 text-3xl font-semibold ${tom === "alerta" ? "text-red-700" : "text-verde-escuro"}`}>{valor}</p>
      {sub && <p className="mt-0.5 text-xs text-tinta/60">{sub}</p>}
    </div>
  );
  return href ? <Link href={href} className="block">{corpo}</Link> : corpo;
}
