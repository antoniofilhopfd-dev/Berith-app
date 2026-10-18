import { requireUser } from "@/lib/auth/session";
import { exigir } from "@/lib/auth/pagina";
import { permissoesDe } from "@/lib/permissions";
import { lerConfig } from "@/lib/services/configuracoes";
import { ActionForm, Field, inputCls } from "@/components/action-form";
import { Card } from "@/components/ui";
import { ministerioAction } from "../actions";

export const metadata = { title: "Ministério e preferências editoriais" };
export const dynamic = "force-dynamic";

export default async function Ministerio() {
  const user = await requireUser();
  await exigir(user.id, "configuracoes", "ver");
  const [cfg, perms] = await Promise.all([lerConfig(), permissoesDe(user.id)]);
  const pode = perms.has("configuracoes:gerir");
  return (
    <Card title="Dados do ministério e preferências editoriais">
      <ActionForm action={ministerioAction} submit="Salvar configurações" resetOnOk={false}>
        <fieldset disabled={!pode} className="space-y-3">
          <Field label="Nome do ministério"><input name="nomeMinisterio" required maxLength={150} defaultValue={cfg.nomeMinisterio} className={inputCls} /></Field>
          <Field label="Hashtags padrão (sugeridas no editor)"><input name="hashtagsPadrao" maxLength={600} defaultValue={cfg.hashtagsPadrao} className={inputCls} /></Field>
          <Field label="Horários sugeridos para publicar (HH:MM, separados por vírgula)"><input name="horariosSugeridos" defaultValue={cfg.horariosSugeridos.join(", ")} className={inputCls} /></Field>
          <Field label="Avisar sobre prazos com antecedência de (horas)"><input name="lembretePrazoHoras" type="number" min={1} max={168} defaultValue={cfg.lembretePrazoHoras} className={inputCls} /></Field>
          <label className="flex items-start gap-2 text-sm"><input type="checkbox" name="exigirAprovacao" defaultChecked={cfg.exigirAprovacao} className="mt-1 h-5 w-5 shrink-0" /><span><strong>Bloquear o agendamento de conteúdo não aprovado.</strong> Quando ligado, só publicações aprovadas podem ser agendadas.</span></label>
          <label className="flex items-start gap-2 text-sm"><input type="checkbox" name="impedirAutoaprovacao" defaultChecked={cfg.impedirAutoaprovacao} className="mt-1 h-5 w-5 shrink-0" /><span><strong>Impedir que alguém aprove o próprio conteúdo</strong> (quem criou ou é responsável não pode aprovar).</span></label>
        </fieldset>
        {!pode && <p className="text-xs text-tinta/60">Somente administradores podem alterar estas configurações.</p>}
      </ActionForm>
    </Card>
  );
}
