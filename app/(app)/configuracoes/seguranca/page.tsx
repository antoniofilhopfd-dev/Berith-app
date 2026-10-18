import { requireUser, hashSessaoAtual } from "@/lib/auth/session";
import { sessoesDoUsuario } from "@/lib/services/senha";
import { ActionForm, Field, inputCls } from "@/components/action-form";
import { Badge, Card } from "@/components/ui";
import { formatDateTime } from "@/lib/format";
import { encerrarOutrasAction, encerrarSessaoAction, senhaAction } from "../actions";

export const metadata = { title: "Segurança" };
export const dynamic = "force-dynamic";

export default async function Seguranca() {
  const user = await requireUser();
  const sessoes = await sessoesDoUsuario(user.id, await hashSessaoAtual());
  return (
    <>
      <Card title="Alterar senha">
        <ActionForm action={senhaAction} submit="Alterar senha">
          <Field label="Senha atual"><input name="atual" type="password" autoComplete="current-password" required className={inputCls} /></Field>
          <Field label="Nova senha (mín. 10 caracteres, com letras e números)"><input name="nova" type="password" autoComplete="new-password" required minLength={10} className={inputCls} /></Field>
          <Field label="Confirmar nova senha"><input name="confirmar" type="password" autoComplete="new-password" required className={inputCls} /></Field>
          <p className="text-xs text-tinta/60">Ao trocar a senha, os outros dispositivos são desconectados.</p>
        </ActionForm>
      </Card>
      <Card title="Dispositivos conectados">
        <ul className="divide-y divide-borda text-sm">{sessoes.map((s) => (
          <li key={s.id} className="flex flex-wrap items-center gap-2 py-3"><div className="min-w-0 flex-1"><p className="truncate">{s.user_agent ?? "Dispositivo desconhecido"} {s.atual && <Badge tom="verde">este dispositivo</Badge>}</p><p className="text-xs text-tinta/60">IP {s.ip ?? "—"} · entrou em {formatDateTime(s.criado_em)} · expira em {formatDateTime(s.expira_em)}</p></div>
            {!s.atual && <ActionForm action={encerrarSessaoAction} submit="Encerrar" danger className="space-y-0"><input type="hidden" name="id" value={s.id} /></ActionForm>}</li>
        ))}</ul>
        {sessoes.length > 1 && <ActionForm action={encerrarOutrasAction} submit="Desconectar os outros dispositivos" danger className="mt-3 space-y-0"><span /></ActionForm>}
      </Card>
      <Card title="Como o app protege o acesso">
        <ul className="list-disc space-y-1 pl-5 text-sm text-tinta/80"><li>Senhas guardadas com hash bcrypt; o app nunca vê nem registra a senha em texto.</li><li>Sessão em cookie protegido (HttpOnly, Secure e SameSite) validada no servidor a cada ação.</li><li>Bloqueio temporário após várias tentativas de login erradas.</li><li>Tokens das redes sociais ficam cifrados (AES-256-GCM) e nunca são exibidos.</li><li>Toda ação sensível fica registrada em Logs e auditoria.</li></ul>
      </Card>
    </>
  );
}
