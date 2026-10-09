export function Card({ title, children, className = "" }: { title?: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={`rounded-2xl border border-borda bg-cartao p-4 ${className}`}>
      {title && <h2 className="mb-3 font-medium">{title}</h2>}
      {children}
    </section>
  );
}
export const Badge = ({ children }: { children: React.ReactNode }) => (
  <span className="rounded-full bg-verde/10 px-2 py-0.5 text-xs text-verde">{children}</span>
);
export const Empty = ({ children }: { children: React.ReactNode }) => <p className="text-sm text-tinta/60">{children}</p>;
