import Link from "next/link";
import { requireUser } from "@/lib/auth/session";
import { permissoesDe } from "@/lib/permissions";
import { itensVisiveis } from "@/lib/nav";
import { PageHeader } from "@/components/ui";

export const metadata = { title: "Menu" };

export default async function Mais() {
  const user = await requireUser();
  const itens = itensVisiveis(await permissoesDe(user.id)).filter((i) => i.href !== "/");
  return (
    <div>
      <PageHeader titulo="Menu" />
      <ul className="grid grid-cols-2 gap-3">
        {itens.map((i) => <li key={i.href}><Link href={i.href} className="flex min-h-14 items-center rounded-xl border border-borda bg-cartao p-3 text-sm font-medium text-verde-escuro hover:border-verde">{i.rotulo}</Link></li>)}
        <li><Link href="/notificacoes" className="flex min-h-14 items-center rounded-xl border border-borda bg-cartao p-3 text-sm font-medium text-verde-escuro hover:border-verde">Notificações</Link></li>
      </ul>
    </div>
  );
}
