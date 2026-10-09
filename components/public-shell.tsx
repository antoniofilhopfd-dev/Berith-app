export function PublicShell({ titulo, sub, children }: { titulo: string; sub?: string; children: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-4 py-10">
      <div className="mb-6 text-center">
        <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-vinho text-2xl text-ouro" aria-hidden>✝</div>
        <h1 className="font-titulo text-2xl text-vinho">{titulo}</h1>
        {sub && <p className="mt-1 text-sm text-tinta/70">{sub}</p>}
      </div>
      <div className="rounded-2xl border border-borda bg-cartao p-5 shadow-sm">{children}</div>
    </main>
  );
}
