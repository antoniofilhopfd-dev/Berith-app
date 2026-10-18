import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { exigir } from "@/lib/auth/pagina";
import { permissoesDe } from "@/lib/permissions";
import * as M from "@/lib/services/midia";
import { NotFoundError } from "@/lib/services/errors";
import { query } from "@/lib/db";
import type { RowDataPacket } from "mysql2/promise";
import { ActionForm, Field, inputCls } from "@/components/action-form";
import { Card, PageHeader } from "@/components/ui";
import { StatusBadge } from "@/components/pub-ui";
import { formatBytes, formatDateTime } from "@/lib/format";
import type { Status } from "@/lib/editorial";
import { atualizarMidiaAction, removerMidiaAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function DetalheMidia({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  await exigir(user.id, "midia", "ver");
  const mid = Number((await params).id);
  if (!Number.isInteger(mid) || mid <= 0) notFound();
  let m;
  try { m = await M.getMidia(user.id, mid); } catch (e) { if (e instanceof NotFoundError) notFound(); throw e; }
  const [perms, pastas, usos] = await Promise.all([
    permissoesDe(user.id), M.listarPastas(user.id),
    query<RowDataPacket & { id: number; titulo: string; status: Status }>("SELECT p.id, p.titulo, p.status FROM publicacao_midias pm JOIN publicacoes p ON p.id = pm.publicacao_id WHERE pm.midia_id = ? ORDER BY p.id DESC LIMIT 20", [mid]),
  ]);
  const pode = perms.has("midia:editar") || (m.criado_por === user.id && perms.has("midia:criar"));
  return (
    <div className="space-y-5">
      <PageHeader titulo={m.nome_original} sub={`${m.tipo === "video" ? "Vídeo" : "Imagem"} · ${formatBytes(Number(m.tamanho))}${m.largura ? ` · ${m.largura}×${m.altura}` : ""} · enviado por ${m.autor ?? "—"} em ${formatDateTime(m.criado_em)}`}>
        <Link href="/midia" className="text-sm underline">Voltar à biblioteca</Link>
        <a href={`/api/midias/${m.id}?baixar=1`} className="inline-flex min-h-10 items-center rounded-lg border border-borda px-4 text-sm hover:bg-fundo">Baixar</a>
      </PageHeader>
      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          {m.tipo === "imagem"
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={`/api/midias/${m.id}`} alt={m.texto_alternativo ?? m.nome_original} className="mx-auto max-h-[70vh] w-auto rounded" />
            : <video src={`/api/midias/${m.id}`} controls preload="metadata" className="mx-auto max-h-[70vh] w-full rounded" />}
        </Card>
        <div className="space-y-4">
          {pode ? (
            <Card title="Informações">
              <ActionForm action={atualizarMidiaAction} submit="Salvar" resetOnOk={false}>
                <input type="hidden" name="id" value={m.id} />
                <Field label="Descrição"><input name="descricao" maxLength={300} defaultValue={m.descricao ?? ""} className={inputCls} /></Field>
                <Field label="Texto alternativo (acessibilidade)"><input name="textoAlternativo" maxLength={300} defaultValue={m.texto_alternativo ?? ""} className={inputCls} /></Field>
                <Field label="Pasta"><select name="pastaId" defaultValue={m.pasta_id ?? ""} className={inputCls}><option value="">Sem pasta</option>{pastas.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}</select></Field>
                <Field label="Etiquetas (separadas por vírgula)"><input name="etiquetas" defaultValue={m.etiquetas ?? ""} className={inputCls} /></Field>
              </ActionForm>
            </Card>
          ) : <Card title="Informações"><p className="text-sm">{m.descricao ?? "Sem descrição."}</p></Card>}
          <Card title={`Uso em publicações (${usos.length})`}>
            {usos.length === 0 ? <p className="text-sm text-tinta/60">Ainda não usada.</p> : <ul className="space-y-1 text-sm">{usos.map((u) => <li key={u.id} className="flex items-center gap-2"><Link href={`/producao/${u.id}`} className="underline">{u.titulo}</Link><StatusBadge status={u.status} /></li>)}</ul>}
          </Card>
          {perms.has("midia:excluir") && <Card title="Remover"><p className="mb-2 text-sm text-tinta/70">A mídia vai para a lixeira e é apagada de vez após 30 dias. Não é possível remover mídia usada em publicações ativas.</p><ActionForm action={removerMidiaAction} submit="Remover da biblioteca" danger><input type="hidden" name="id" value={m.id} /></ActionForm></Card>}
        </div>
      </div>
    </div>
  );
}
