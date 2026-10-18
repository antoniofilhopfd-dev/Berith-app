import type { RowDataPacket } from "mysql2/promise";
import { query } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { exigir } from "@/lib/auth/pagina";
import { storageDir } from "@/lib/storage/disco";
import { Card } from "@/components/ui";
import { formatBytes } from "@/lib/format";

export const metadata = { title: "Backup" };
export const dynamic = "force-dynamic";

export default async function Backup() {
  const user = await requireUser();
  await exigir(user.id, "configuracoes", "gerir");
  const [bd, midias] = await Promise.all([
    query<RowDataPacket>("SELECT COALESCE(SUM(data_length + index_length), 0) AS bytes FROM information_schema.tables WHERE table_schema = DATABASE()"),
    query<RowDataPacket>("SELECT COUNT(*) AS n, COALESCE(SUM(tamanho), 0) AS bytes FROM midias WHERE removido_em IS NULL"),
  ]);
  return (
    <>
      <Card title="O que precisa de backup">
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div><dt className="text-tinta/60">Banco de dados</dt><dd className="font-semibold">{formatBytes(Number(bd[0].bytes))}</dd></div>
          <div><dt className="text-tinta/60">Biblioteca de mídia</dt><dd className="font-semibold">{midias[0].n} arquivo(s) · {formatBytes(Number(midias[0].bytes))}</dd></div>
          <div className="sm:col-span-2"><dt className="text-tinta/60">Pasta dos arquivos (STORAGE_DIR)</dt><dd className="break-all font-mono text-xs">{storageDir()}</dd></div>
        </dl>
      </Card>
      <Card title="Como fazer e conferir">
        <ol className="list-decimal space-y-2 pl-5 text-sm">
          <li>O backup é feito por script no servidor (não pelo navegador): <code>scripts/backup.sh</code> gera um pacote com o banco e a pasta de mídia e uma soma de verificação.</li>
          <li>Agende-o no cron da hospedagem (diário) e copie os pacotes para fora do servidor.</li>
          <li>Teste a restauração periodicamente com <code>scripts/restaurar.sh</code> em um banco de teste. O script aborta sem alterar nada se o pacote estiver corrompido.</li>
          <li>Garanta que <code>STORAGE_DIR</code> aponte para um local persistente: o disco da aplicação pode ser recriado a cada publicação nova.</li>
        </ol>
        <p className="mt-2 text-xs text-tinta/60">Passo a passo completo em <code>docs/OPERACAO.md</code>. Nenhum dado é apagado automaticamente: mídias removidas ficam 30 dias na lixeira antes da limpeza.</p>
      </Card>
    </>
  );
}
