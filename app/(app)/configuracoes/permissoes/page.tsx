import Link from "next/link";
import type { RowDataPacket } from "mysql2/promise";
import { query } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { PERFIS, PERFIL_ROTULO, RECURSOS, permissoesDe } from "@/lib/permissions";
import { Card } from "@/components/ui";

export const metadata = { title: "Usuários e permissões" };
export const dynamic = "force-dynamic";

const REC: Record<string, string> = { planejamento: "Planejamento", calendario: "Calendário", producao: "Produção", aprovacao: "Aprovação", publicacao: "Publicação", midia: "Biblioteca de mídia", relatorios: "Relatórios", equipe: "Equipe", integracoes: "Integrações", configuracoes: "Configurações", auditoria: "Auditoria" };
const ACAO: Record<string, string> = { ver: "ver", criar: "criar", editar: "editar", excluir: "excluir", aprovar: "aprovar", exportar: "exportar", gerir: "gerir" };

export default async function Permissoes() {
  const user = await requireUser();
  const perms = await permissoesDe(user.id);
  const rows = await query<RowDataPacket>("SELECT r.codigo, rp.recurso, rp.acao FROM role_permissions rp JOIN roles r ON r.id = rp.role_id WHERE r.codigo IN (?)", [PERFIS as unknown as string[]]);
  const tem = (p: string, rec: string) => rows.filter((r) => r.codigo === p && r.recurso === rec).map((r) => ACAO[r.acao as string]).filter(Boolean).join(", ");
  return (
    <Card title="Perfis e o que cada um pode fazer" className="overflow-x-auto">
      <p className="mb-3 text-sm text-tinta/70">As permissões são aplicadas no servidor a cada ação, não só na interface. Quem não tem perfil não acessa nada. A atribuição de perfis é feita em <Link href="/equipe" className="underline">Equipe</Link>{perms.has("equipe:gerir") ? "" : " (somente administradores)"}.</p>
      <table className="w-full min-w-[640px] text-left text-sm">
        <caption className="sr-only">Matriz de permissões por perfil</caption>
        <thead className="border-b border-borda text-xs uppercase text-tinta/60"><tr><th scope="col" className="py-2">Área</th>{PERFIS.map((p) => <th key={p} scope="col">{PERFIL_ROTULO[p]}</th>)}</tr></thead>
        <tbody className="divide-y divide-borda">{RECURSOS.map((rec) => <tr key={rec}><th scope="row" className="py-2 pr-2 font-medium">{REC[rec]}</th>{PERFIS.map((p) => <td key={p} className="pr-2 text-xs">{tem(p, rec) || <span className="text-tinta/30">—</span>}</td>)}</tr>)}</tbody>
      </table>
      <p className="mt-3 text-xs text-tinta/60">Integrantes editam apenas o que criaram ou o que foi atribuído a eles. Coordenadores e administradores editam tudo. Aprovadores decidem sobre conteúdos em revisão.</p>
    </Card>
  );
}
