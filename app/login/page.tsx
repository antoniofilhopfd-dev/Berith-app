import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";
import { LoginForm } from "./login-form";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  if (await getSessionUser()) redirect("/");
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-4 py-10">
      <div className="mb-8 text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-vinho text-3xl text-ouro" aria-hidden>✝</div>
        <h1 className="font-titulo text-3xl text-vinho">Nova Berith</h1>
        <p className="mt-1 text-sm text-tinta/70">Comunidade Católica — acesso exclusivo para membros</p>
      </div>
      <LoginForm />
      <p className="mt-6 text-center text-xs text-tinta/60">
        Não há cadastro aberto. O acesso é concedido por convite da coordenação.
      </p>
    </main>
  );
}
