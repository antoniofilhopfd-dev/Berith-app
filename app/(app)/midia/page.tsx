import Link from "next/link";
import { requireUser } from "@/lib/auth/session";
import { exigir } from "@/lib/auth/pagina";
import { permissoesDe } from "@/lib/permissions";
import * as M from "@/lib/services/midia";
import { ActionForm, Field, inputCls } from "@/components/action-form";
import { UploadMidia } from "@/components/upload-midia";
import { Badge, Card, Empty, PageHeader } from "@/components/ui";
import { formatBytes } from "@/lib/format";
import { criarPastaAction, excluirPastaAction } from "./actions";

export const metadata = { title: "Biblioteca de mídia" };
export const dynamic = "force-dynamic";

export default async function Biblioteca({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireUser();
  await exigir(user.id, "midia", "ver");
  const sp = await searchParams;
  const perms = await permissoesDe(user.id);
  const pasta = sp.pasta === "raiz" ? "raiz" : sp.pasta && Number(sp.pasta) > 0 ? Number(sp.pasta) : undefined;
  const tipo = sp.tipo === "imagem" || sp.tipo === "video" ? sp.tipo : undefined;
  const pagina = Math.max(1, Number(sp.p) || 1);
  const [lista, pastas, etiquetas, repetidos] = await Promise.all([
    M.listar(user.id, { q: sp.q?.trim().slice(0, 80), tipo, pastaId: pasta, etiqueta: sp.etiqueta, pagina }),
    M.listarPastas(user.id), M.listarEtiquetas(user.id), M.nomesRepetidos(user.id),
  ]);
  const atual = typeof pasta === "number" ? pastas.find((p) => p.id === pasta) : undefined;
  const repetidosIds = new Set(repetidos.flatMap((r) => r.ids));
  const paginas = Math.max(1, Math.ceil(lista.total / M.POR_PAGINA));
  const q = (o: Record<string, string | undefined>) => { const u = new URLSearchParams(); for (const [k, v] of Object.entries({ ...sp, ...o })) if (v) u.set(k, v); return `?${u.toString()}`; };
  return (
    <div>
      <PageHeader titulo="Biblioteca de mídia" sub="Imagens e vídeos do ministério, em armazenamento privado. Escolha-os direto no editor de produção." />
      <div className="grid gap-5 lg:grid-cols-[240px_1fr]">
        <aside className="space-y-4" aria-label="Pastas e etiquetas">
          <Card title="Pastas">
            <ul className="space-y-0.5 text-sm">
              <li><Link href={q({ pasta: undefined, p: undefined })} className={`block rounded px-2 py-1.5 ${pasta === undefined ? "bg-verde/10 font-semibold" : "hover:bg-fundo"}`}>Todas as mídias</Link></li>
              <li><Link href={q({ pasta: "raiz", p: undefined })} className={`block rounded px-2 py-1.5 ${pasta === "raiz" ? "bg-verde/10 font-semibold" : "hover:bg-fundo"}`}>Sem pasta</Link></li>
              {pastas.map((p) => <li key={p.id}><Link href={q({ pasta: String(p.id), p: undefined })} className={`flex justify-between rounded px-2 py-1.5 ${pasta === p.id ? "bg-verde/10 font-semibold" : "hover:bg-fundo"}`} style={{ paddingLeft: p.parent_id ? 20 : 8 }}><span className="truncate">{p.nome}</span><span className="text-tinta/50">{p.total}</span></Link></li>)}
            </ul>
            {perms.has("midia:criar") && (
              <ActionForm action={criarPastaAction} submit="Criar pasta" className="mt-3">
                <Field label="Nova pasta"><input name="nome" required minLength={2} maxLength={80} className={inputCls} /></Field>
                {atual && <label className="flex items-center gap-2 text-xs"><input type="checkbox" name="paiId" value={atual.id} className="h-4 w-4" /> Dentro de “{atual.nome}”</label>}
              </ActionForm>
            )}
            {atual && perms.has("midia:excluir") && atual.total === 0 && <ActionForm action={excluirPastaAction} submit="Excluir esta pasta" danger className="mt-2 space-y-0"><input type="hidden" name="id" value={atual.id} /></ActionForm>}
          </Card>
          {etiquetas.length > 0 && <Card title="Etiquetas"><ul className="flex flex-wrap gap-1">{etiquetas.map((e) => <li key={e.nome}><Link href={q({ etiqueta: sp.etiqueta === e.nome ? undefined : e.nome, p: undefined })} className={`rounded-full border px-2 py-0.5 text-xs ${sp.etiqueta === e.nome ? "border-verde bg-verde text-white" : "border-borda"}`}>{e.nome} ({e.total})</Link></li>)}</ul></Card>}
        </aside>

        <div className="space-y-4">
          {perms.has("midia:criar") && <Card title="Enviar"><UploadMidia pastaId={typeof pasta === "number" ? pasta : null} /><p className="mt-2 text-xs text-tinta/60">Arquivos repetidos são identificados pelo conteúdo e reaproveitados. Tamanho máximo: imagens 15 MB; vídeos conforme a configuração do servidor.</p></Card>}
          <form method="get" className="flex flex-wrap items-center gap-2" aria-label="Buscar e filtrar">
            {pasta !== undefined && <input type="hidden" name="pasta" value={String(pasta)} />}
            <input name="q" type="search" defaultValue={sp.q ?? ""} placeholder="Buscar por nome, descrição ou etiqueta" aria-label="Buscar" className="min-h-10 flex-1 rounded-lg border border-borda px-3 text-sm" />
            <select name="tipo" defaultValue={sp.tipo ?? ""} aria-label="Tipo" className="min-h-10 rounded-lg border border-borda px-2 text-sm"><option value="">Imagens e vídeos</option><option value="imagem">Só imagens</option><option value="video">Só vídeos</option></select>
            <button className="min-h-10 rounded-lg bg-verde px-4 text-sm text-white">Buscar</button>
          </form>
          {repetidos.length > 0 && <p className="rounded-lg bg-amber-50 p-3 text-sm">Há {repetidos.length} nome(s) de arquivo repetido(s) com conteúdos diferentes (marcados como “nome repetido”). Confira se não são versões duplicadas.</p>}
          {lista.itens.length === 0 ? <Empty>Nenhuma mídia encontrada.</Empty> : (
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
              {lista.itens.map((m) => (
                <li key={m.id} className="overflow-hidden rounded-xl border border-borda bg-cartao">
                  <Link href={`/midia/${m.id}`} className="block">
                    <div className="aspect-square bg-borda/40">
                      {m.tipo === "imagem"
                        // eslint-disable-next-line @next/next/no-img-element
                        ? <img src={`/api/midias/${m.id}`} alt={m.texto_alternativo ?? m.nome_original} loading="lazy" className="h-full w-full object-cover" />
                        : <video src={`/api/midias/${m.id}`} muted preload="metadata" className="h-full w-full object-cover" aria-label={m.nome_original} />}
                    </div>
                    <div className="space-y-1 p-2"><p className="truncate text-sm font-medium" title={m.nome_original}>{m.nome_original}</p>
                      <p className="text-xs text-tinta/60">{m.tipo === "video" ? "Vídeo" : "Imagem"} · {formatBytes(Number(m.tamanho))}{m.largura ? ` · ${m.largura}×${m.altura}` : ""}</p>
                      <p className="flex flex-wrap gap-1">{m.usos > 0 && <Badge tom="verde">em {m.usos} uso(s)</Badge>}{repetidosIds.has(m.id) && <Badge tom="amarelo">nome repetido</Badge>}{m.etiquetas?.split(",").map((e) => <Badge key={e} tom="cinza">{e}</Badge>)}</p></div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          {paginas > 1 && <nav aria-label="Páginas" className="flex items-center justify-center gap-3 text-sm">{pagina > 1 && <Link href={q({ p: String(pagina - 1) })} className="underline">‹ Anterior</Link>}<span>Página {pagina} de {paginas}</span>{pagina < paginas && <Link href={q({ p: String(pagina + 1) })} className="underline">Próxima ›</Link>}</nav>}
        </div>
      </div>
    </div>
  );
}
