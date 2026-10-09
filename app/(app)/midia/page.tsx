import Link from "next/link";
import { requireUser } from "@/lib/auth/session";
import { listarAlbuns } from "@/lib/services/arquivos";
import { unitsFor } from "@/lib/services/alvos";
import { can } from "@/lib/permissions";
import { eventosRecentes } from "@/lib/services/eventos";
import { Badge, Card, Empty } from "@/components/ui";
import { ActionForm, Field, inputCls } from "@/components/action-form";
import { TIPO_LABEL } from "@/lib/format";
import { criarAlbumAction } from "./actions";
import { Images, FolderOpen } from "lucide-react";

export default async function Midia() {
  const user = await requireUser();
  const [albuns, verUnidades, criarUnidades, criarGlobal, eventos] = await Promise.all([
    listarAlbuns(user.id), unitsFor(user.id, "midia", "ver"), unitsFor(user.id, "midia", "criar"), can(user.id, "midia", "criar", null),
    eventosRecentes(user.id),
  ]);
  return (
    <div className="space-y-4">
      <h1 className="font-titulo text-2xl text-verde">Fotos e documentos</h1>
      <Card title="Álbuns">
        {albuns.length === 0 ? <Empty>Nenhum álbum disponível para você.</Empty> : (
          <ul className="divide-y divide-borda">
            {albuns.map((a) => (
              <li key={a.id}><Link href={`/midia/albuns/${a.id}`} className="flex min-h-14 items-center gap-3 py-2"><Images size={22} className="text-verde" aria-hidden />
                <span className="min-w-0 flex-1"><span className="block font-medium">{a.titulo}</span><span className="block text-xs text-tinta/60">{a.unit_nome ?? "Toda a comunidade"} · {Number(a.fotos)} foto(s)</span></span>
                {!a.permitir_download && <Badge>sem download</Badge>}</Link></li>
            ))}
          </ul>
        )}
      </Card>
      <Card title="Documentos">
        <ul className="divide-y divide-borda">
          <li><Link href="/midia/documentos/0" className="flex min-h-12 items-center gap-3 py-2"><FolderOpen size={20} className="text-verde" aria-hidden /> Comunidade (geral)</Link></li>
          {verUnidades.map((u) => <li key={u.id}><Link href={`/midia/documentos/${u.id}`} className="flex min-h-12 items-center gap-3 py-2"><FolderOpen size={20} className="text-verde" aria-hidden /> {u.nome} <Badge>{TIPO_LABEL[u.tipo]}</Badge></Link></li>)}
        </ul>
      </Card>
      {(criarGlobal || criarUnidades.length > 0) && (
        <Card title="Novo álbum">
          <ActionForm action={criarAlbumAction} submit="Criar álbum">
            <Field label="Título"><input name="titulo" required minLength={3} maxLength={160} className={inputCls} /></Field>
            <Field label="Descrição (opcional)"><input name="descricao" maxLength={500} className={inputCls} /></Field>
            <Field label="Quem pode ver">
              <select name="unitId" className={inputCls} defaultValue={criarGlobal ? "" : criarUnidades[0]?.id}>
                {criarGlobal && <option value="">Toda a comunidade</option>}
                {criarUnidades.map((u) => <option key={u.id} value={u.id}>Somente: {TIPO_LABEL[u.tipo]} {u.nome}</option>)}
              </select>
            </Field>
            <Field label="Evento (opcional)"><select name="eventId" className={inputCls} defaultValue=""><option value="">Sem evento</option>{eventos.map((e) => <option key={e.id} value={e.id}>{e.titulo}</option>)}</select></Field>
            <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" name="permitirDownload" defaultChecked className="h-5 w-5" /> Permitir download das fotos</label>
          </ActionForm>
        </Card>
      )}
    </div>
  );
}
