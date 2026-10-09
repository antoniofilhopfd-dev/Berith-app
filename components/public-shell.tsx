import Image from "next/image";
export function PublicShell({ titulo, sub, children }: { titulo: string; sub?: string; children: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-4 py-10">
      <div className="mb-6 text-center">
        <Image src="/icons/icon-192.png" alt="" width={56} height={56} className="mx-auto mb-3 h-14 w-14 rounded-full" />
        <h1 className="font-titulo text-2xl text-verde">{titulo}</h1>
        {sub && <p className="mt-1 text-sm text-tinta/70">{sub}</p>}
      </div>
      <div className="rounded-2xl border border-borda bg-cartao p-5 shadow-sm">{children}</div>
    </main>
  );
}
