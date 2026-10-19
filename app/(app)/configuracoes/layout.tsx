import { requireUser } from "@/lib/auth/session";
import { permissoesDe } from "@/lib/permissions";
import { PageHeader } from "@/components/ui";
import { ConfigNav } from "@/components/config-nav";

export default async function ConfigLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const perms = await permissoesDe(user.id);
  const itens = [
    { href: "/configuracoes/perfil", rotulo: "Meu perfil", ok: true },
    { href: "/configuracoes/ministerio", rotulo: "Ministério e preferências editoriais", ok: perms.has("configuracoes:ver") },
    { href: "/configuracoes/permissoes", rotulo: "Usuários e permissões", ok: perms.has("equipe:ver") || perms.has("configuracoes:ver") },
    { href: "/configuracoes/redes", rotulo: "Redes sociais e integrações", ok: perms.has("integracoes:ver") },
    { href: "/configuracoes/notificacoes", rotulo: "Notificações", ok: true },
    { href: "/configuracoes/seguranca", rotulo: "Segurança", ok: true },
    { href: "/configuracoes/auditoria", rotulo: "Logs e auditoria", ok: perms.has("auditoria:ver") },
    { href: "/configuracoes/backup", rotulo: "Backup", ok: perms.has("configuracoes:gerir") },
    { href: "/configuracoes/geral", rotulo: "Configurações gerais", ok: perms.has("configuracoes:ver") },
  ].filter((i) => i.ok);
  return (
    <div>
      <PageHeader titulo="Configurações" />
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[240px_minmax(0,1fr)]">
        <ConfigNav itens={itens} />
        <div className="min-w-0 space-y-5">{children}</div>
      </div>
    </div>
  );
}
