import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { exigir } from "@/lib/auth/pagina";
import * as A from "@/lib/services/agendamento";
import { NotFoundError } from "@/lib/services/errors";
import { ActionForm, Field, inputCls } from "@/components/action-form";
import { Card, PageHeader } from "@/components/ui";
import { CopiarTexto } from "@/components/copiar-texto";
import { FormatoTag, RedeTag } from "@/components/pub-ui";
import { FORMATO_ROTULO, REDE_ROTULO } from "@/lib/editorial";
import { publicadaManualAction } from "../../actions";

export const dynamic = "force-dynamic";

export default async function Assistida({ params }: { params: Promise<{ redeId: string }> }) {
  const user = await requireUser();
  await exigir(user.id, "publicacao", "criar");
  const rid = Number((await params).redeId);
  if (!Number.isInteger(rid) || rid <= 0) notFound();
  let p;
  try { p = await A.preparoAssistido(user.id, rid); } catch (e) { if (e instanceof NotFoundError) notFound(); throw e; }
  const publicada = p.envio === "publicada";
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <PageHeader titulo="Publicação assistida" sub="Você publica na rede social e confirma aqui. O app não finge publicação automática.">
        <RedeTag rede={p.rede} comNome /><FormatoTag formato={p.formato} />
      </PageHeader>
      <Card title={`1. Copie o texto (${REDE_ROTULO[p.rede]})`}>
        {p.rede === "youtube" && <p className="mb-2 text-sm"><strong>Título:</strong> {p.titulo}</p>}
        <pre className="max-h-60 overflow-auto whitespace-pre-wrap break-words rounded bg-fundo p-3 text-sm">{p.texto || "(sem legenda)"}</pre>
        <div className="mt-2"><CopiarTexto texto={p.texto} /></div>
      </Card>
      <Card title="2. Baixe as mídias">
        {p.midias.length === 0 ? <p className="text-sm text-tinta/60">Esta publicação não tem mídia.</p> : (
          <ul className="space-y-1 text-sm">{p.midias.map((m, i) => <li key={m.id}><a className="underline" href={`/api/midias/${m.id}?baixar=1`}>{i + 1}. {m.nome_original} ({m.tipo === "video" ? "vídeo" : "imagem"}{m.largura ? `, ${m.largura}×${m.altura}` : ""})</a></li>)}</ul>
        )}
      </Card>
      <Card title="3. Publique na rede">
        <p className="text-sm">Abra a rede, envie as mídias na ordem acima, cole o texto e publique como <strong>{FORMATO_ROTULO[p.formato]}</strong>.</p>
        <a href={p.abrir} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex min-h-10 items-center rounded-lg border border-borda px-4 text-sm hover:bg-fundo">Abrir {REDE_ROTULO[p.rede]} em nova aba</a>
      </Card>
      <Card title="4. Confirme">
        {publicada ? <p className="text-sm text-green-800">Esta rede já consta como publicada.</p> : (
          <ActionForm action={publicadaManualAction} submit="Já publiquei — registrar">
            <input type="hidden" name="redeId" value={rid} />
            <Field label="Link da publicação (opcional)"><input name="url" type="url" placeholder="https://" className={inputCls} /></Field>
            <p className="text-xs text-tinta/60">Fica registrado como publicação assistida (manual), com seu nome e horário.</p>
          </ActionForm>
        )}
        <Link href={`/producao/${p.publicacaoId}`} className="mt-3 inline-block text-sm underline">Voltar para a produção</Link>
      </Card>
    </div>
  );
}
