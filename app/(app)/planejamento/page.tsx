import Link from "next/link";
import { requireUser } from "@/lib/auth/session";
import { exigir } from "@/lib/auth/pagina";
import { permissoesDe } from "@/lib/permissions";
import * as P from "@/lib/services/publicacoes";
import * as PL from "@/lib/services/planejamento";
import { opcoesProducao } from "@/lib/services/opcoes";
import { ActionForm, Field, inputCls } from "@/components/action-form";
import { Badge, Card, Empty, PageHeader, Tabs } from "@/components/ui";
import { FormatoTag, PrioridadeTag, RedesTags, StatusBadge } from "@/components/pub-ui";
import { PRIORIDADES, PRIORIDADE_ROTULO, REDES, REDE_ROTULO } from "@/lib/editorial";
import { navegar, periodo } from "@/lib/calendario";
import { DIAS, MESES, brDate, isDate, localToUtc, utcToLocal } from "@/lib/time";
import { formatDateTime } from "@/lib/format";
import { alternarEditoriaAction, converterIdeiaAction, criarDataAction, criarIdeiaAction, decidirIdeiaAction, excluirCampanhaAction, excluirDataAction, salvarCampanhaAction, salvarEditoriaAction } from "./actions";

export const metadata = { title: "Planejamento editorial" };
export const dynamic = "force-dynamic";

const ABAS = [
  { chave: "semana", rotulo: "Semana", href: "?aba=semana" }, { chave: "mes", rotulo: "Mês", href: "?aba=mes" }, { chave: "campanhas", rotulo: "Campanhas", href: "?aba=campanhas" },
  { chave: "ideias", rotulo: "Ideias", href: "?aba=ideias" }, { chave: "editorias", rotulo: "Editorias e temas", href: "?aba=editorias" }, { chave: "datas", rotulo: "Datas especiais", href: "?aba=datas" },
];

export default async function Planejamento({ searchParams }: { searchParams: Promise<{ aba?: string; d?: string }> }) {
  const user = await requireUser();
  await exigir(user.id, "planejamento", "ver");
  const sp = await searchParams;
  const aba = ABAS.some((a) => a.chave === sp.aba) ? sp.aba! : "semana";
  const perms = await permissoesDe(user.id);
  return (
    <div>
      <PageHeader titulo="Planejamento editorial" sub="Semana, mês, campanhas, ideias, temas e datas importantes." />
      <Tabs itens={ABAS} ativo={aba} />
      {(aba === "semana" || aba === "mes") && <Periodo aba={aba} d={sp.d} user={user.id} />}
      {aba === "campanhas" && <Campanhas user={user.id} podeCriar={perms.has("planejamento:criar")} podeEditar={perms.has("planejamento:editar")} podeExcluir={perms.has("planejamento:excluir")} />}
      {aba === "ideias" && <Ideias user={user.id} podeCriar={perms.has("planejamento:criar")} podeEditar={perms.has("planejamento:editar") && perms.has("producao:criar")} />}
      {aba === "editorias" && <Editorias user={user.id} pode={perms.has("planejamento:editar")} />}
      {aba === "datas" && <Datas user={user.id} podeCriar={perms.has("planejamento:criar")} podeExcluir={perms.has("planejamento:excluir")} />}
    </div>
  );
}

async function Periodo({ aba, d, user }: { aba: "semana" | "mes"; d?: string; user: number }) {
  const visao = aba === "mes" ? "mes" : "semana";
  const hoje = utcToLocal(new Date()).date;
  const ancora = d && isDate(d) ? d : hoje;
  const { inicio, fim, dias } = periodo(visao, ancora);
  const [lista, datas, sem] = await Promise.all([
    P.listar(user, { de: localToUtc(inicio, "00:00"), ate: localToUtc(fim, "00:00"), limite: 500 }),
    PL.datasDoPeriodo(user, inicio, dias[dias.length - 1]),
    P.listar(user, { status: ["rascunho", "em_producao", "ajustes_solicitados"], limite: 200 }).then((a) => a.filter((p) => !p.publicar_em)),
  ]);
  const ativos = lista.filter((p) => p.status !== "cancelado");
  const [a, m] = ancora.split("-").map(Number);
  const titulo = visao === "mes" ? `${MESES[m - 1]} de ${a}` : `${brDate(inicio).slice(0, 5)} a ${brDate(dias[6]).slice(0, 5)}`;
  const mesRef = ancora.slice(0, 7);
  const porRede = REDES.map((r) => [r, ativos.filter((p) => p.redes.includes(r)).length] as const).filter(([, n]) => n > 0);
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex overflow-hidden rounded-lg border border-borda"><Link href={`?aba=${aba}&d=${navegar(visao, ancora, -1)}`} aria-label="Anterior" className="flex min-h-10 items-center bg-white px-3">‹</Link><Link href={`?aba=${aba}&d=${hoje}`} className="flex min-h-10 items-center border-x border-borda bg-white px-3 text-sm">Hoje</Link><Link href={`?aba=${aba}&d=${navegar(visao, ancora, 1)}`} aria-label="Próximo" className="flex min-h-10 items-center bg-white px-3">›</Link></div>
        <h2 className="text-lg font-semibold text-verde-escuro">{titulo[0].toUpperCase() + titulo.slice(1)}</h2>
        <span className="ml-auto text-sm text-tinta/70">{ativos.length} publicação(ões){porRede.length > 0 && ` · ${porRede.map(([r, n]) => `${REDE_ROTULO[r]} ${n}`).join(" · ")}`}</span>
      </div>
      <ul className="space-y-3">
        {dias.filter((x) => visao === "semana" || x.slice(0, 7) === mesRef).map((dia) => {
          const itens = ativos.filter((p) => utcToLocal(new Date(p.publicar_em!)).date === dia);
          const especiais = datas.filter((x) => x.dia === dia);
          if (visao === "mes" && itens.length === 0 && especiais.length === 0) return null;
          return (
            <li key={dia} className={`rounded-xl border bg-cartao p-3 ${dia === hoje ? "border-verde" : "border-borda"}`}>
              <p className="mb-1 flex flex-wrap items-center gap-2 text-sm font-semibold">{DIAS[new Date(dia + "T12:00:00Z").getUTCDay()]}, {brDate(dia).slice(0, 5)}{especiais.map((e) => <Badge key={e.nome} tom="cobre">{e.nome}</Badge>)}</p>
              {itens.length === 0 ? <p className="text-xs text-tinta/50">Nada planejado. <Link href={`/producao/nova?data=${dia}`} className="underline">Criar</Link></p> : (
                <ul className="divide-y divide-borda">{itens.map((p) => (
                  <li key={p.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm"><span className="w-12 tabular-nums text-tinta/60">{utcToLocal(new Date(p.publicar_em!)).time}</span>
                    <Link href={`/producao/${p.id}`} className="font-medium text-verde-escuro hover:underline">{p.titulo}</Link><FormatoTag formato={p.formato} /><RedesTags redes={p.redes} /><StatusBadge status={p.status} />
                    {p.objetivo && <span className="basis-full pl-14 text-xs text-tinta/60">Objetivo: {p.objetivo}</span>}
                    <span className="basis-full pl-14 text-xs text-tinta/60">{p.responsavel_nome ?? "Sem responsável"}{p.prazo ? ` · prazo ${formatDateTime(p.prazo)}` : ""}{p.campanha_nome ? ` · ${p.campanha_nome}` : ""}</span></li>
                ))}</ul>
              )}
            </li>
          );
        })}
      </ul>
      {sem.length > 0 && (
        <Card title={`Sem data de publicação (${sem.length})`}>
          <ul className="divide-y divide-borda text-sm">{sem.slice(0, 15).map((p) => <li key={p.id} className="flex flex-wrap items-center gap-2 py-2"><Link href={`/producao/${p.id}`} className="font-medium hover:underline">{p.titulo}</Link><StatusBadge status={p.status} /><span className="text-xs text-tinta/60">{p.responsavel_nome ?? "—"}</span></li>)}</ul>
        </Card>
      )}
    </div>
  );
}

async function Campanhas({ user, podeCriar, podeEditar, podeExcluir }: { user: number; podeCriar: boolean; podeEditar: boolean; podeExcluir: boolean }) {
  const [lista, op] = await Promise.all([PL.listarCampanhas(user), opcoesProducao(user)]);
  const campos = (c?: (typeof lista)[number]) => (
    <>
      {c && <input type="hidden" name="id" value={c.id} />}
      <Field label="Nome da campanha"><input name="nome" required maxLength={120} defaultValue={c?.nome} className={inputCls} /></Field>
      <Field label="Objetivo"><input name="objetivo" maxLength={300} defaultValue={c?.objetivo ?? ""} className={inputCls} /></Field>
      <Field label="Descrição"><textarea name="descricao" rows={2} defaultValue={c?.descricao ?? ""} className={inputCls + " py-2"} /></Field>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Início"><input name="inicio" type="date" defaultValue={c?.inicio ?? ""} className={inputCls} /></Field>
        <Field label="Fim"><input name="fim" type="date" defaultValue={c?.fim ?? ""} className={inputCls} /></Field>
        <Field label="Situação"><select name="status" defaultValue={c?.status ?? "planejada"} className={inputCls}><option value="planejada">Planejada</option><option value="ativa">Ativa</option><option value="encerrada">Encerrada</option></select></Field>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Responsável"><select name="responsavelId" defaultValue={c?.responsavel_id ?? ""} className={inputCls}><option value="">—</option>{op.pessoas.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}</select></Field>
        <Field label="Cor"><input name="cor" type="color" defaultValue={c?.cor ?? "#b07840"} className="h-11 w-full rounded-lg border border-borda bg-white" /></Field>
      </div>
    </>
  );
  return (
    <div className="space-y-4">
      <p className="text-sm text-tinta/70">Campanhas são agrupamentos editoriais (por exemplo, Advento ou Semana Vocacional). Não têm relação com anúncios pagos.</p>
      {lista.length === 0 ? <Empty>Nenhuma campanha cadastrada.</Empty> : (
        <ul className="grid gap-4 md:grid-cols-2">{lista.map((c) => (
          <li key={c.id}><Card>
            <p className="flex items-center gap-2"><span aria-hidden className="h-3 w-3 rounded-full" style={{ background: c.cor }} /><strong>{c.nome}</strong><Badge tom={c.status === "ativa" ? "verde" : c.status === "encerrada" ? "cinza" : "amarelo"}>{c.status}</Badge></p>
            {c.objetivo && <p className="mt-1 text-sm">{c.objetivo}</p>}
            <p className="mt-1 text-xs text-tinta/60">{c.inicio ? brDate(c.inicio) : "—"} a {c.fim ? brDate(c.fim) : "—"} · {c.responsavel_nome ?? "sem responsável"}</p>
            <p className="mt-1 text-sm">{c.publicadas} de {c.total} publicação(ões) concluída(s) <Link href={`/producao?camp=${c.id}&v=lista`} className="underline">ver</Link></p>
            {podeEditar && <details className="mt-3"><summary className="min-h-10 cursor-pointer py-2 text-sm text-verde-escuro">Editar</summary>
              <ActionForm action={salvarCampanhaAction} submit="Salvar campanha" resetOnOk={false}>{campos(c)}</ActionForm>
              {podeExcluir && <ActionForm action={excluirCampanhaAction} submit="Excluir campanha" danger className="mt-2 space-y-0"><input type="hidden" name="id" value={c.id} /></ActionForm>}</details>}
          </Card></li>
        ))}</ul>
      )}
      {podeCriar && <Card title="Nova campanha"><ActionForm action={salvarCampanhaAction} submit="Criar campanha">{campos()}</ActionForm></Card>}
    </div>
  );
}

async function Ideias({ user, podeCriar, podeEditar }: { user: number; podeCriar: boolean; podeEditar: boolean }) {
  const [lista, op] = await Promise.all([PL.listarIdeias(user), opcoesProducao(user)]);
  return (
    <div className="space-y-4">
      {podeCriar && (
        <Card title="Nova ideia de conteúdo">
          <ActionForm action={criarIdeiaAction} submit="Registrar ideia">
            <Field label="Título"><input name="titulo" required maxLength={160} className={inputCls} /></Field>
            <Field label="Descrição"><textarea name="descricao" rows={2} className={inputCls + " py-2"} /></Field>
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Editoria"><select name="editoriaId" className={inputCls}><option value="">—</option>{op.editorias.map((e) => <option key={e.id} value={e.id}>{e.nome}</option>)}</select></Field>
              <Field label="Campanha"><select name="campanhaId" className={inputCls}><option value="">—</option>{op.campanhas.map((e) => <option key={e.id} value={e.id}>{e.nome}</option>)}</select></Field>
              <Field label="Prioridade"><select name="prioridade" defaultValue="media" className={inputCls}>{PRIORIDADES.map((p) => <option key={p} value={p}>{PRIORIDADE_ROTULO[p]}</option>)}</select></Field>
            </div>
            <fieldset className="flex flex-wrap gap-3"><legend className="mb-1 text-sm font-medium">Redes sugeridas</legend>{REDES.map((r) => <label key={r} className="flex items-center gap-1 text-sm"><input type="checkbox" name="redes" value={r} className="h-4 w-4" />{REDE_ROTULO[r]}</label>)}</fieldset>
            <Field label="Referências"><textarea name="referencias" rows={2} className={inputCls + " py-2"} /></Field>
          </ActionForm>
        </Card>
      )}
      {lista.length === 0 ? <Empty>Nenhuma ideia registrada ainda.</Empty> : (
        <ul className="space-y-3">{lista.map((i) => (
          <li key={i.id}><Card>
            <p className="flex flex-wrap items-center gap-2"><strong>{i.titulo}</strong><PrioridadeTag p={i.prioridade} /><Badge tom={i.status === "convertida" ? "verde" : i.status === "descartada" ? "cinza" : i.status === "aprovada" ? "azul" : "amarelo"}>{i.status.replace("_", " ")}</Badge></p>
            {i.descricao && <p className="mt-1 whitespace-pre-line text-sm">{i.descricao}</p>}
            <p className="mt-1 text-xs text-tinta/60">{[i.editoria_nome, i.campanha_nome, i.redes?.split(",").map((r) => REDE_ROTULO[r as never] ?? r).join(", "), i.autor && `por ${i.autor}`].filter(Boolean).join(" · ")}</p>
            {i.publicacao_id && <Link href={`/producao/${i.publicacao_id}`} className="mt-1 inline-block text-sm underline">Abrir produção</Link>}
            {podeEditar && i.status !== "convertida" && (
              <div className="mt-3 flex flex-wrap gap-2">
                <ActionForm action={converterIdeiaAction} submit="Transformar em produção" className="space-y-0"><input type="hidden" name="id" value={i.id} /></ActionForm>
                {i.status !== "aprovada" && <ActionForm action={decidirIdeiaAction} submit="Aprovar ideia" className="space-y-0"><input type="hidden" name="id" value={i.id} /><input type="hidden" name="status" value="aprovada" /></ActionForm>}
                {i.status === "nova" && <ActionForm action={decidirIdeiaAction} submit="Em análise" className="space-y-0"><input type="hidden" name="id" value={i.id} /><input type="hidden" name="status" value="em_analise" /></ActionForm>}
                {i.status !== "descartada" && <ActionForm action={decidirIdeiaAction} submit="Descartar" danger className="space-y-0"><input type="hidden" name="id" value={i.id} /><input type="hidden" name="status" value="descartada" /></ActionForm>}
              </div>
            )}
          </Card></li>
        ))}</ul>
      )}
    </div>
  );
}

async function Editorias({ user, pode }: { user: number; pode: boolean }) {
  const lista = await PL.listarEditorias(user);
  return (
    <div className="space-y-4">
      <p className="text-sm text-tinta/70">Editorias são os grandes temas de conteúdo do ministério. Servem para equilibrar o que é publicado.</p>
      <ul className="grid gap-3 md:grid-cols-2">{lista.map((e) => (
        <li key={e.id}><Card>
          <p className="flex items-center gap-2"><span aria-hidden className="h-3 w-3 rounded-full" style={{ background: e.cor }} /><strong>{e.nome}</strong>{!e.ativa && <Badge tom="cinza">inativa</Badge>}<span className="ml-auto text-xs text-tinta/60">{e.publicacoes} publicação(ões)</span></p>
          {e.descricao && <p className="mt-1 text-sm text-tinta/70">{e.descricao}</p>}
          {pode && <details className="mt-2"><summary className="min-h-10 cursor-pointer py-2 text-sm text-verde-escuro">Editar</summary>
            <ActionForm action={salvarEditoriaAction} submit="Salvar" resetOnOk={false}><input type="hidden" name="id" value={e.id} />
              <Field label="Nome"><input name="nome" required maxLength={80} defaultValue={e.nome} className={inputCls} /></Field><Field label="Descrição"><input name="descricao" maxLength={300} defaultValue={e.descricao ?? ""} className={inputCls} /></Field>
              <Field label="Cor"><input name="cor" type="color" defaultValue={e.cor} className="h-11 w-24 rounded-lg border border-borda bg-white" /></Field></ActionForm>
            <ActionForm action={alternarEditoriaAction} submit={e.ativa ? "Desativar" : "Reativar"} className="mt-2 space-y-0"><input type="hidden" name="id" value={e.id} /><input type="hidden" name="ativa" value={e.ativa ? "0" : "1"} /></ActionForm></details>}
        </Card></li>
      ))}</ul>
      {pode && <Card title="Nova editoria"><ActionForm action={salvarEditoriaAction} submit="Criar editoria"><Field label="Nome"><input name="nome" required maxLength={80} className={inputCls} /></Field><Field label="Descrição"><input name="descricao" maxLength={300} className={inputCls} /></Field><Field label="Cor"><input name="cor" type="color" defaultValue="#587458" className="h-11 w-24 rounded-lg border border-borda bg-white" /></Field></ActionForm></Card>}
    </div>
  );
}

async function Datas({ user, podeCriar, podeExcluir }: { user: number; podeCriar: boolean; podeExcluir: boolean }) {
  const hoje = utcToLocal(new Date()).date;
  const fim = `${Number(hoje.slice(0, 4)) + 1}-${hoje.slice(5)}`;
  const [proximas, proprias] = await Promise.all([PL.datasDoPeriodo(user, hoje, fim), PL.listarDatasProprias(user)]);
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card title="Próximos 12 meses">
        <ul className="max-h-[28rem] divide-y divide-borda overflow-y-auto text-sm">{proximas.map((d) => <li key={d.dia + d.nome} className="flex items-center justify-between gap-2 py-1.5"><span>{d.nome} {d.origem === "ministerio" && <Badge tom="verde">do ministério</Badge>}</span><span className="shrink-0 text-tinta/60">{brDate(d.dia)}</span></li>)}</ul>
        <p className="mt-2 text-xs text-tinta/60">Sugestões calculadas automaticamente (fixas e móveis). Confirme as datas no calendário oficial antes de planejar.</p>
      </Card>
      <div className="space-y-4">
        {podeCriar && <Card title="Cadastrar data do ministério"><ActionForm action={criarDataAction} submit="Cadastrar"><Field label="Nome"><input name="nome" required maxLength={120} className={inputCls} /></Field><Field label="Data"><input name="dia" type="date" required className={inputCls} /></Field><label className="flex items-center gap-2 text-sm"><input type="checkbox" name="anual" defaultChecked className="h-4 w-4" /> Repete todo ano</label></ActionForm></Card>}
        <Card title="Datas cadastradas">
          {proprias.length === 0 ? <Empty>Nenhuma data própria.</Empty> : <ul className="divide-y divide-borda text-sm">{proprias.map((d) => <li key={d.id} className="flex items-center justify-between gap-2 py-2"><span>{d.nome} · {brDate(String(d.dia))}{d.anual ? " (anual)" : ""}</span>{podeExcluir && <ActionForm action={excluirDataAction} submit="Remover" danger className="space-y-0"><input type="hidden" name="id" value={d.id} /></ActionForm>}</li>)}</ul>}
        </Card>
      </div>
    </div>
  );
}
