import type { RowDataPacket } from "mysql2/promise";
import { query } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { exigir } from "@/lib/auth/pagina";
import { baseUrl } from "@/lib/auth/guard";
import { permissoesDe } from "@/lib/permissions";
import { contasInstagram, logs, redirectUri, statusRedes } from "@/lib/integracoes/contas";
import { cifraDisponivel } from "@/lib/integracoes/cripto";
import { ActionForm } from "@/components/action-form";
import { Badge, Card, Empty } from "@/components/ui";
import { RedeTag } from "@/components/pub-ui";
import { REDE_ROTULO } from "@/lib/editorial";
import { formatDateTime } from "@/lib/format";
import { conectarAction, desconectarAction, removerContaAction } from "../actions";

export const metadata = { title: "Redes sociais e integrações" };
export const dynamic = "force-dynamic";

const ESTADO = { conectada: ["verde", "Conectada"], expirada: ["amarelo", "Acesso expirado — reconecte"], erro: ["vermelho", "Com erro"], nao_conectada: ["cinza", "Não conectada"], app_nao_configurado: ["cinza", "Credenciais do app não configuradas"] } as const;
const CONSOLE: Record<string, string> = {
  instagram: "Meta for Developers (app com produto “Facebook Login” e permissões do Instagram); conta profissional vinculada a uma Página.",
  facebook: "Meta for Developers (mesmo app do Instagram); o usuário precisa administrar a Página.",
  tiktok: "TikTok for Developers: produtos Login Kit e Content Posting API. A publicação direta pública exige a auditoria do app pelo TikTok.",
  youtube: "Google Cloud Console: YouTube Data API v3 e tela de consentimento OAuth. Projetos não verificados só publicam vídeos privados.",
};

export default async function Redes({ searchParams }: { searchParams: Promise<{ ok?: string; erro?: string }> }) {
  const user = await requireUser();
  await exigir(user.id, "integracoes", "ver");
  const sp = await searchParams;
  const [perms, redes, ls, base, ult] = await Promise.all([permissoesDe(user.id), statusRedes(user.id), logs(user.id, 40), baseUrl(), query<RowDataPacket>("SELECT valor FROM settings WHERE chave = 'cron_ultima_execucao'")]);
  const gerir = perms.has("integracoes:gerir");
  const contasIg = await contasInstagram();
  return (
    <div className="space-y-5">
      {sp.ok && <p role="status" className="rounded-lg bg-green-50 p-3 text-sm text-green-800">{sp.ok}</p>}
      {sp.erro && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{sp.erro}</p>}
      {!cifraDisponivel() && <p role="alert" className="rounded-lg bg-amber-50 p-3 text-sm">A variável <code>TOKEN_ENC_KEY</code> (mín. 32 caracteres) não está definida: sem ela não é possível conectar redes, pois os tokens são guardados cifrados.</p>}
      <p className="text-sm text-tinta/70">A publicação e as métricas automáticas usam somente as APIs oficiais de cada plataforma. Sem conexão, o fluxo continua funcionando com a <strong>publicação assistida</strong>. Última execução do agendador: {ult[0] ? formatDateTime(new Date(String(ult[0].valor))) : "nunca (configure o cron — veja a documentação de implantação)"}.</p>
      <ul className="grid gap-4 md:grid-cols-2">
        {redes.map((r) => {
          const [tom, rot] = ESTADO[r.estado];
          return (
            <li key={r.rede}><Card>
              <p className="flex flex-wrap items-center gap-2"><RedeTag rede={r.rede} comNome /><Badge tom={tom}>{rot}</Badge></p>
              {r.conta && <p className="mt-2 text-sm">{r.conta.nome ?? "Conta"} · conectada em {formatDateTime(r.conta.conectadaEm)}{r.conta.expiraEm ? ` · acesso até ${formatDateTime(r.conta.expiraEm)}` : ""}</p>}
              {r.rede === "instagram" && contasIg.length > 0 && (
                <div className="mt-3 rounded-lg border border-borda bg-white p-3 text-sm">
                  <p className="mb-1 text-xs font-semibold uppercase text-tinta/60">Contas acompanhadas ({contasIg.length})</p>
                  <ul className="divide-y divide-borda">{contasIg.map((c) => (
                    <li key={c.igId} className="flex flex-wrap items-center justify-between gap-2 py-1.5">
                      <span>{c.usuario} <Badge tom={c.principal ? "verde" : "cinza"}>{c.principal ? "principal (publica)" : "só métricas"}</Badge></span>
                      {gerir && !c.principal && <ActionForm action={removerContaAction} submit="Remover" danger className="space-y-0"><input type="hidden" name="igId" value={c.igId} /></ActionForm>}
                    </li>))}
                  </ul>
                  <p className="mt-2 text-xs text-tinta/60">Ao conectar, todas as Páginas com Instagram profissional que você autorizar entram aqui. Para acompanhar outra conta, clique em Reconectar e marque também a Página dela. A principal é a que recebe as publicações.</p>
                </div>
              )}
              {r.conta?.ultimoErro && <p className="mt-1 rounded bg-red-50 p-2 text-xs text-red-900">{r.conta.ultimoErro}</p>}
              {!r.appConfigurado && <p className="mt-2 text-sm">Defina no ambiente: <code>{r.variaveis.join("</code>, <code>")}</code>.</p>}
              <details className="mt-2 text-xs text-tinta/70"><summary className="cursor-pointer">Requisitos e permissões</summary>
                <p className="mt-1">{CONSOLE[r.rede]}</p><p className="mt-1">Permissões solicitadas: {r.escopos.map((s) => s.replace("https://www.googleapis.com/auth/", "")).join(", ")}</p>
                <p className="mt-1">URL de retorno a cadastrar na plataforma: <code className="break-all">{redirectUri(base, r.rede)}</code></p></details>
              {gerir && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {r.appConfigurado && <ActionForm action={conectarAction} submit={r.conta ? "Reconectar" : `Conectar ${REDE_ROTULO[r.rede]}`} className="space-y-0"><input type="hidden" name="rede" value={r.rede} /></ActionForm>}
                  {r.conta && <ActionForm action={desconectarAction} submit="Desconectar" danger className="space-y-0"><input type="hidden" name="rede" value={r.rede} /></ActionForm>}
                </div>
              )}
            </Card></li>
          );
        })}
      </ul>
      <Card title="Registro de integração">
        {ls.length === 0 ? <Empty>Sem eventos.</Empty> : <ul className="divide-y divide-borda text-xs">{ls.map((l) => <li key={l.id} className="flex flex-wrap gap-x-2 py-1.5"><span className="text-tinta/50">{formatDateTime(l.criado_em)}</span><Badge tom={l.nivel === "erro" ? "vermelho" : l.nivel === "aviso" ? "amarelo" : "cinza"}>{l.nivel}</Badge><span>{l.rede ?? "—"} · {l.evento}</span>{l.detalhes && <span className="basis-full text-tinta/70">{l.detalhes}</span>}</li>)}</ul>}
        <p className="mt-2 text-xs text-tinta/60">Tokens, códigos e segredos nunca aparecem aqui: são mascarados antes de gravar.</p>
      </Card>
    </div>
  );
}
