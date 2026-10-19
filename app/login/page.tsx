import Image from "next/image";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";
import { modoLogin } from "@/lib/auth/codigo";
import { LoginForm } from "./login-form";
import { CodigoForm } from "./codigo-form";

export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const next = (await searchParams).next ?? "";
  if (await getSessionUser()) redirect("/");
  const modo = await modoLogin();
  return (
    <main className="pt-safe pb-safe mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-4 py-10">
      <div className="mb-8 text-center">
        <Image src="/brand/logo-cor.png" alt="Nova Berith — Comunidade Católica: sorriso de Deus para o mundo e esperança para os que sofrem" width={900} height={544} priority className="mx-auto h-auto w-full max-w-72" />
        <p className="mt-3 text-sm text-tinta/70">Ministério de Comunicação — acesso da equipe</p>
      </div>
      <CodigoForm next={next} />
      {modo === "ambos" && (
        <details className="mt-4 rounded-2xl border border-borda bg-cartao p-4 text-sm">
          <summary className="min-h-11 cursor-pointer py-2 text-verde underline">Entrar com e-mail e senha</summary>
          <div className="mt-3"><LoginForm next={next} /></div>
          <p className="mt-3 text-center"><a href="/recuperar-senha" className="inline-flex min-h-11 items-center text-verde underline">Esqueci minha senha</a></p>
        </details>
      )}
      <p className="mt-2 text-center text-xs text-tinta/60">
        Não há cadastro aberto. O acesso é concedido pelo administrador, que entrega o seu código.
      </p>
    </main>
  );
}
