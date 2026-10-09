import Image from "next/image";
import Link from "next/link";

export default function NaoEncontrado() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center px-4 text-center">
      <Image src="/icons/icon-192.png" alt="" width={56} height={56} className="mb-3 h-14 w-14 rounded-full" />
      <h1 className="font-titulo text-2xl text-verde">Página não encontrada</h1>
      <p className="mt-2 text-sm text-tinta/70">O endereço não existe ou você não tem acesso a ele.</p>
      <Link href="/" className="mt-4 inline-flex min-h-11 items-center rounded-lg bg-verde px-4 text-sm text-white">Voltar ao início</Link>
    </main>
  );
}
