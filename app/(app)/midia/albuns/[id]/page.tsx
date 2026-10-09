import { notFound } from "next/navigation";
import Link from "next/link";
import { requireUser } from "@/lib/auth/session";
import { getAlbum, historicoAlbum, listarAnexos } from "@/lib/services/arquivos";
import { can } from "@/lib/permissions";
import { NotFoundError } from "@/lib/services/errors";
import { Badge, Card, Empty } from "@/components/ui";
import { ActionForm } from "@/components/action-form";
import { UploadBox } from "@/components/upload-box";
import { excluirArquivoAction } from "../../../arquivos-actions";
import { excluirAlbumAction } from "../../actions";
import { formatDate, formatTime } from "@/lib/format";

const ROTULO_HISTORICO: Record<string, string> = { "album.criar": "Álbum criado", "arquivo.enviar": "Foto enviada", "arquivo.excluir": "Foto removida" };

export default async function AlbumDetalhe({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) notFound();
  let album, anexos;
  try { album = await getAlbum(user.id, id); anexos = await listarAnexos(user.id, "album", id); } catch (e) { if (e instanceof NotFoundError) notFound(); throw e; }
  const [editar, excluir] = await Promise.all([can(user.id, "midia", "editar", album.unit_id), can(user.id, "midia", "excluir", album.unit_id)]);
  const historico = editar ? await historicoAlbum(user.id, id) : [];
  return (
    <div className="space-y-4">
      <Link href="/midia" className="inline-flex min-h-11 items-center text-sm text-verde">← Fotos e documentos</Link>
      <header>
        <div className="flex gap-1"><Badge>{album.unit_nome ?? "Toda a comunidade"}</Badge>{!album.permitir_download && <Badge>sem download</Badge>}</div>
        <h1 className="mt-1 font-titulo text-2xl text-verde">{album.titulo}</h1>
        {album.descricao && <p className="text-sm text-tinta/70">{album.descricao}</p>}
      </header>
      {anexos.arquivos.length === 0 ? <Card><Empty>Nenhuma foto neste álbum.</Empty></Card> : (
        <ul className="grid grid-cols-2 gap-2">
          {anexos.arquivos.map((a) => (
            <li key={a.id} className="overflow-hidden rounded-xl border border-borda bg-white">
              <a href={`/api/arquivos/${a.id}`} target="_blank" rel="noopener noreferrer" className="block aspect-square bg-borda/40">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/api/arquivos/${a.id}`} alt={a.descricao ?? a.nome_original} loading="lazy" className="h-full w-full object-cover" />
              </a>
              <div className="p-2">
                {a.descricao && <p className="line-clamp-2 text-xs">{a.descricao}</p>}
                <div className="flex flex-wrap items-center gap-2">
                  {anexos.permitirDownload && <a href={`/api/arquivos/${a.id}?baixar=1`} className="inline-flex min-h-11 items-center text-xs text-verde underline">Baixar</a>}
                  {anexos.podeExcluir(a) && <ActionForm action={excluirArquivoAction} submit="Remover" danger className="space-y-0"><input type="hidden" name="id" value={a.id} /></ActionForm>}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
      {anexos.podeSubir && (
        <Card title="Enviar fotos">
          <UploadBox ctxTipo="album" ctxId={id} aceitar="image/jpeg,image/png,image/webp" exigeAutorizacaoImagem comDescricao rotulo="Fotos (JPG, PNG ou WebP, até 8 MB cada)" />
        </Card>
      )}
      {editar && historico.length > 0 && (
        <Card title="Histórico de alterações">
          <ul className="divide-y divide-borda text-sm">{historico.map((h, i) => <li key={i} className="py-2"><strong>{ROTULO_HISTORICO[h.acao] ?? h.acao}</strong> <span className="text-xs text-tinta/60">por {h.nome ?? "—"} · {formatDate(h.criado_em)} {formatTime(h.criado_em)}</span></li>)}</ul>
        </Card>
      )}
      {excluir && <ActionForm action={excluirAlbumAction} submit="Excluir álbum e fotos" danger><input type="hidden" name="id" value={id} /></ActionForm>}
    </div>
  );
}
