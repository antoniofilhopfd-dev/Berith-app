import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";
import { logoutAction } from "@/lib/auth/actions";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col">
      <header className="sticky top-0 z-10 flex items-center justify-between bg-vinho px-4 py-3 text-white">
        <span className="font-titulo text-lg">Nova Berith</span>
        <form action={logoutAction}>
          <button className="min-h-11 rounded-lg px-3 text-sm hover:bg-white/10">Sair</button>
        </form>
      </header>
      <main className="flex-1 px-4 py-6">{children}</main>
    </div>
  );
}
