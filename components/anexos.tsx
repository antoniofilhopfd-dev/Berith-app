import { listarAnexos, type CtxTipo } from "@/lib/services/arquivos";
import { formatBytes, formatDate } from "@/lib/format";
import { ActionForm } from "./action-form";
import { UploadBox } from "./upload-box";
import { Card, Empty } from "./ui";
import { excluirArquivoAction } from "@/app/(app)/arquivos-actions";
import { FileText, Download } from "lucide-react";

/** Lista os anexos de um contexto (já filtrados por permissão) e, se permitido, o envio com progresso. */
export async function Anexos({ actor, tipo, ctxId, titulo = "Anexos", aceitar }: { actor: number; tipo: CtxTipo; ctxId: number; titulo?: string; aceitar?: string }) {
  const { arquivos, podeSubir, podeExcluir, permitirDownload } = await listarAnexos(actor, tipo, ctxId);
  if (arquivos.length === 0 && !podeSubir) return null;
  return (
    <Card title={titulo}>
      {arquivos.length === 0 ? <Empty>Nenhum arquivo anexado.</Empty> : (
        <ul className="divide-y divide-borda">
          {arquivos.map((a) => (
            <li key={a.id} className="py-3">
              {a.mime.startsWith("audio/") ? (
                <>
                  <p className="mb-1 text-sm font-medium">{a.nome_original} <span className="text-xs font-normal text-tinta/60">({formatBytes(Number(a.tamanho))})</span></p>
                  <audio controls preload="none" src={`/api/arquivos/${a.id}`} className="w-full" />
                </>
              ) : (
                <a href={`/api/arquivos/${a.id}`} target="_blank" rel="noopener noreferrer" className="flex min-h-11 items-center gap-2 text-verde">
                  <FileText size={20} aria-hidden />
                  <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{a.nome_original}</span>
                    <span className="block text-xs text-tinta/60">{formatBytes(Number(a.tamanho))} · {formatDate(a.criado_em)}</span></span>
                </a>
              )}
              {a.descricao && <p className="text-xs text-tinta/70">{a.descricao}</p>}
              <div className="mt-1 flex flex-wrap items-center gap-2">
                {permitirDownload && <a href={`/api/arquivos/${a.id}?baixar=1`} className="inline-flex min-h-11 items-center gap-1 text-sm text-verde underline"><Download size={14} aria-hidden /> Baixar</a>}
                {podeExcluir(a) && <ActionForm action={excluirArquivoAction} submit="Remover" danger className="space-y-0"><input type="hidden" name="id" value={a.id} /></ActionForm>}
              </div>
            </li>
          ))}
        </ul>
      )}
      {podeSubir && <div className="mt-3 border-t border-borda pt-3"><UploadBox ctxTipo={tipo} ctxId={ctxId} aceitar={aceitar} /></div>}
    </Card>
  );
}
