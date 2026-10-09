import Link from "next/link";

export default function NaoEncontrado() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center px-4 text-center">
      <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-vinho text-2xl text-ouro" aria-hidden>✝</div>
      <h1 className="font-titulo text-2xl text-vinho">Página não encontrada</h1>
      <p className="mt-2 text-sm text-tinta/70">O endereço não existe ou você não tem acesso a ele.</p>
      <Link href="/" className="mt-4 inline-flex min-h-11 items-center rounded-lg bg-vinho px-4 text-sm text-white">Voltar ao início</Link>
    </main>
  );
}
