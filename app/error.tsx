"use client";

export default function Erro({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center px-4 text-center">
      <h1 className="font-titulo text-2xl text-verde">Algo deu errado</h1>
      <p className="mt-2 text-sm text-tinta/70">Não foi possível carregar esta página. Verifique sua conexão e tente novamente.</p>
      <button onClick={reset} className="mt-4 min-h-11 rounded-lg bg-verde px-4 text-sm text-white">Tentar novamente</button>
    </main>
  );
}
