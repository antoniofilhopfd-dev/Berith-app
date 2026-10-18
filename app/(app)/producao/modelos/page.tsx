import { requireUser } from "@/lib/auth/session";
import { exigir } from "@/lib/auth/pagina";
import { permissoesDe } from "@/lib/permissions";
import { listarModelos } from "@/lib/services/publicacoes";
import { ActionForm, Field, inputCls } from "@/components/action-form";
import { Card, Empty, PageHeader } from "@/components/ui";
import { FORMATO_ROTULO, REDE_ROTULO, type Rede } from "@/lib/editorial";
import { criarDeModeloAction, excluirModeloAction } from "../actions";

export const metadata = { title: "Modelos de conteúdo" };
export const dynamic = "force-dynamic";

export default async function Modelos() {
  const user = await requireUser();
  await exigir(user.id, "producao", "ver");
  const [modelos, perms] = await Promise.all([listarModelos(user.id), permissoesDe(user.id)]);
  return (
    <div>
      <PageHeader titulo="Modelos de conteúdo" sub="Estruturas reutilizáveis de legenda, hashtags, formato e redes. Para criar um, abra uma produção e use “Salvar como modelo”." />
      {modelos.length === 0 ? <Empty>Nenhum modelo salvo ainda.</Empty> : (
        <ul className="grid gap-4 md:grid-cols-2">
          {modelos.map((m) => (
            <li key={m.id}>
              <Card title={m.nome}>
                <p className="text-sm text-tinta/70">{FORMATO_ROTULO[m.formato]} · {m.redes.split(",").map((r) => REDE_ROTULO[r as Rede] ?? r).join(", ")}</p>
                {m.objetivo && <p className="mt-1 text-sm">Objetivo: {m.objetivo}</p>}
                {m.legenda && <p className="mt-2 line-clamp-4 whitespace-pre-line rounded bg-fundo p-2 text-xs">{m.legenda}</p>}
                {m.hashtags && <p className="mt-1 text-xs text-verde-escuro">{m.hashtags}</p>}
                {perms.has("producao:criar") && (
                  <ActionForm action={criarDeModeloAction} submit="Criar a partir deste modelo" className="mt-3"><input type="hidden" name="modeloId" value={m.id} /><Field label="Título da nova produção"><input name="titulo" required maxLength={160} className={inputCls} /></Field></ActionForm>
                )}
                {perms.has("producao:excluir") && <ActionForm action={excluirModeloAction} submit="Excluir modelo" danger className="mt-3 space-y-0"><input type="hidden" name="id" value={m.id} /></ActionForm>}
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
