import { requireUser } from "@/lib/auth/session";
import { exigir } from "@/lib/auth/pagina";
import { permissoesDe, PERFIL_ROTULO, PERFIS } from "@/lib/permissions";
import { cargaDaEquipe, listarEquipe, listarPendentes } from "@/lib/services/equipe";
import { ActionForm, Field, inputCls } from "@/components/action-form";
import { Badge, Card, Empty, PageHeader } from "@/components/ui";
import { formatDate } from "@/lib/format";
import { codigosVisiveis } from "@/lib/auth/codigo";
import { anonimizarAction, aprovarAction, codigoAcessoAction, definirCodigoAction, convidarAction, linkSenhaAction, perfilEquipeAction, rejeitarAction, situacaoAction } from "./actions";

export const metadata = { title: "Equipe" };
export const dynamic = "force-dynamic";

export default async function Equipe() {
  const user = await requireUser();
  await exigir(user.id, "equipe", "ver");
  const perms = await permissoesDe(user.id);
  const gerir = perms.has("equipe:gerir");
  const [pessoas, carga, pendentes, codigos] = await Promise.all([listarEquipe(user.id), cargaDaEquipe(user.id), gerir ? listarPendentes(user.id) : Promise.resolve([]), gerir ? codigosVisiveis(user.id) : Promise.resolve(new Map<number, string>())]);
  type P = (typeof pessoas)[number];
  const blocoCodigo = (p: P) => p.status !== "ativo" ? <span className="text-xs text-tinta/50">—</span> : (
    <div className="flex flex-col gap-1">
      {codigos.get(p.id) ? <code className="w-fit rounded-md border border-dashed border-verde/50 bg-verde/5 px-2 py-1 font-mono text-sm font-semibold tracking-widest" aria-label={`Código de ${p.nome}`}>{codigos.get(p.id)}</code>
        : <span className="text-xs text-tinta/50">{p.temCodigo ? "definido (não consultável)" : "sem código"}</span>}
      <details className="text-xs"><summary className="inline-flex min-h-10 cursor-pointer items-center rounded border border-borda bg-white px-3 hover:bg-fundo" aria-label={`Editar código de ${p.nome}`}>✎ editar</summary>
        <ActionForm action={definirCodigoAction} submit="Salvar código" resetOnOk className="mt-1 space-y-1"><input type="hidden" name="id" value={p.id} />
          <input name="codigo" required minLength={6} maxLength={11} autoCapitalize="characters" autoComplete="off" placeholder="6 a 10 letras e números" aria-label="Novo código" className="min-h-10 w-full max-w-48 rounded border border-borda px-2 font-mono uppercase" /></ActionForm></details>
    </div>);
  const blocoPerfil = (p: P) => gerir && p.id !== user.id ? (
    <ActionForm action={perfilEquipeAction} submit="Salvar" className="flex flex-wrap items-center gap-1 space-y-0"><input type="hidden" name="id" value={p.id} />
      <select name="perfil" defaultValue={p.perfil ?? "nenhum"} aria-label={`Perfil de ${p.nome}`} className="min-h-10 max-w-full rounded-lg border border-borda px-2 text-sm">{PERFIS.map((x) => <option key={x} value={x}>{PERFIL_ROTULO[x]}</option>)}<option value="nenhum">Sem perfil (sem acesso)</option></select></ActionForm>
  ) : p.perfil ? <Badge tom="verde">{PERFIL_ROTULO[p.perfil]}</Badge> : <Badge tom="cinza">sem perfil</Badge>;
  const blocoAcoes = (p: P) => <>
    {p.status === "ativo" && <ActionForm action={codigoAcessoAction} submit={p.temCodigo ? "Gerar novo código" : "Gerar código de acesso"} className="space-y-0"><input type="hidden" name="id" value={p.id} /></ActionForm>}
    {p.id !== user.id && <>
      <ActionForm action={situacaoAction} submit={p.status === "ativo" ? "Suspender" : "Reativar"} danger={p.status === "ativo"} className="space-y-0"><input type="hidden" name="id" value={p.id} /><input type="hidden" name="status" value={p.status === "ativo" ? "suspenso" : "ativo"} /></ActionForm>
      {p.status === "ativo" && <ActionForm action={linkSenhaAction} submit="Gerar link de senha" className="space-y-0"><input type="hidden" name="id" value={p.id} /></ActionForm>}
      <a href={`/api/equipe/${p.id}/exportar`} className="inline-flex min-h-10 items-center justify-center rounded-lg border border-borda bg-white px-3 text-sm hover:bg-fundo">Exportar dados</a>
      <details className="text-xs"><summary className="inline-flex min-h-10 cursor-pointer items-center rounded-lg border border-red-300 px-3 text-sm text-red-800 hover:bg-red-50">Anonimizar</summary>
        <ActionForm action={anonimizarAction} submit="Anonimizar esta pessoa" danger className="mt-1 space-y-1"><input type="hidden" name="id" value={p.id} />
          <label className="flex items-start gap-1"><input type="checkbox" name="confirmo" className="mt-0.5 h-4 w-4" /><span>Confirmo: remove nome, e-mail e acessos (irreversível); o histórico editorial fica sem identificação.</span></label></ActionForm></details></>}
  </>;
  return (
    <div className="space-y-6">
      <PageHeader titulo="Equipe de comunicação" sub="Integrantes, perfis de acesso e acompanhamento das atividades." />
      {pendentes.length > 0 && (
        <Card title={`Aguardando aprovação (${pendentes.length})`}>
          <ul className="divide-y divide-borda text-sm">{pendentes.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center gap-3 py-3"><div className="min-w-0 flex-1"><p className="font-medium">{p.nome}</p><p className="text-xs text-tinta/60">{p.email} · perfil previsto: {p.perfil ? PERFIL_ROTULO[p.perfil as keyof typeof PERFIL_ROTULO] ?? p.perfil : "nenhum"}</p></div>
              <ActionForm action={aprovarAction} submit="Aprovar" className="space-y-0"><input type="hidden" name="id" value={p.id} /></ActionForm>
              <ActionForm action={rejeitarAction} submit="Recusar" danger className="space-y-0"><input type="hidden" name="id" value={p.id} /></ActionForm></li>
          ))}</ul>
        </Card>
      )}
      <Card title="Integrantes">
        {pessoas.length === 0 ? <Empty>Nenhuma pessoa cadastrada.</Empty> : (
          <>
            {/* Celular: um cartão por pessoa */}
            <ul className="divide-y divide-borda md:hidden">{pessoas.map((p) => {
              const c = carga.get(p.id);
              return (
                <li key={p.id} className={`space-y-3 py-4 ${p.status === "suspenso" ? "opacity-60" : ""}`}>
                  <div><p className="font-semibold">{p.nome}{p.status === "suspenso" && <> <Badge tom="vermelho">suspenso</Badge></>}</p>
                    <p className="break-all text-xs text-tinta/60">{p.email}{p.telefone ? ` · ${p.telefone}` : ""} · desde {formatDate(p.criado_em)}</p></div>
                  <div className="flex flex-wrap items-center gap-2">{blocoPerfil(p)}</div>
                  {gerir && <div><p className="mb-1 text-xs font-semibold uppercase text-tinta/60">Código de acesso</p>{blocoCodigo(p)}</div>}
                  <dl className="grid grid-cols-5 gap-1 text-center text-xs">{([["Produção", c?.aberto], ["Revisão", c?.revisao], ["Ajustes", c?.ajustes], ["Atrasadas", c?.atrasadas], ["Publ. 30 d", c?.publicadasMes]] as const).map(([k, v]) => <div key={k} className="rounded-lg bg-white p-1.5"><dd className={`text-base font-semibold ${k === "Atrasadas" && v ? "text-red-700" : ""}`}>{v ?? 0}</dd><dt className="text-[10px] text-tinta/60">{k}</dt></div>)}</dl>
                  {gerir && <div className="flex flex-wrap gap-2">{blocoAcoes(p)}</div>}
                </li>
              );
            })}</ul>
            {/* Computador: tabela */}
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[760px] text-left text-sm">
                <caption className="sr-only">Equipe de comunicação</caption>
                <thead className="border-b border-borda text-xs uppercase text-tinta/60"><tr><th scope="col" className="py-2">Pessoa</th>{gerir && <th scope="col">Código de acesso</th>}<th scope="col">Perfil</th><th scope="col" className="text-right">Em produção</th><th scope="col" className="text-right">Em revisão</th><th scope="col" className="text-right">Ajustes</th><th scope="col" className="text-right">Atrasadas</th><th scope="col" className="text-right">Publicadas (30 d)</th>{gerir && <th scope="col" className="pl-3">Ações</th>}</tr></thead>
                <tbody className="divide-y divide-borda">{pessoas.map((p) => {
                  const c = carga.get(p.id);
                  return (
                    <tr key={p.id} className={p.status === "suspenso" ? "opacity-60" : ""}>
                      <th scope="row" className="py-2 pr-2 font-medium">{p.nome}{p.status === "suspenso" && <> <Badge tom="vermelho">suspenso</Badge></>}<div className="font-normal text-xs text-tinta/60">{p.temCodigo ? "código de acesso ativo · " : "sem código · "}{p.email}{p.telefone ? ` · ${p.telefone}` : ""} · desde {formatDate(p.criado_em)}</div></th>
                      {gerir && <td className="py-2 pr-3">{blocoCodigo(p)}</td>}
                      <td>{blocoPerfil(p)}</td>
                      <td className="text-right">{c?.aberto ?? 0}</td><td className="text-right">{c?.revisao ?? 0}</td><td className="text-right">{c?.ajustes ?? 0}</td><td className={`text-right ${c?.atrasadas ? "font-semibold text-red-700" : ""}`}>{c?.atrasadas ?? 0}</td><td className="text-right">{c?.publicadasMes ?? 0}</td>
                      {gerir && <td className="pl-3"><div className="flex flex-col gap-1">{blocoAcoes(p)}</div></td>}
                    </tr>
                  );
                })}</tbody>
              </table>
            </div>
          </>
        )}
      </Card>
      {gerir && (
        <Card title="Convidar pessoa">
          <ActionForm action={convidarAction} submit="Criar convite">
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Nome"><input name="nome" required maxLength={150} className={inputCls} /></Field>
              <Field label="E-mail"><input name="email" type="email" required maxLength={190} className={inputCls} /></Field>
              <Field label="Perfil"><select name="perfil" defaultValue="integrante" className={inputCls}>{PERFIS.map((x) => <option key={x} value={x}>{PERFIL_ROTULO[x]}</option>)}</select></Field>
            </div>
            <p className="text-xs text-tinta/60">A pessoa cria a senha pelo link do convite (válido por 7 dias) e o acesso só é liberado depois da sua aprovação.</p>
          </ActionForm>
        </Card>
      )}
    </div>
  );
}
