import Link from "next/link";
import { requireUser } from "@/lib/auth/session";
import { itensDoDia, listarFontes, podeEditarLiturgia, type ItemLiturgia } from "@/lib/services/liturgia";
import { can } from "@/lib/permissions";
import { diaLiturgico } from "@/lib/liturgia/calendario";
import { GRUPO_HORAS, GRUPO_PALAVRA, TIPOS_LITURGIA, TIPO_ROTULO, type TipoLiturgia } from "@/lib/validation/liturgia";
import { addDays, brDate, isDate, todayLocal, utcToLocal } from "@/lib/time";
import { Badge, Card } from "@/components/ui";
import { ActionForm, Field, inputCls } from "@/components/action-form";
import { adicionarFonteAction, excluirLiturgiaAction, importarAgoraAction, provedorAction, removerFonteAction, salvarLiturgiaAction } from "./actions";
import { getProvedor } from "@/lib/services/liturgia-importacao";
import { ChevronLeft, ChevronRight, ExternalLink } from "lucide-react";

const COR: Record<string, string> = { verde: "bg-green-700", roxo: "bg-purple-800", branco: "bg-white ring-1 ring-borda", vermelho: "bg-red-700" };

function Fonte({ i }: { i: ItemLiturgia }) {
  return (
    <p className="mt-3 border-t border-borda pt-2 text-xs text-tinta/60">
      Fonte: {i.fonte_url ? <a href={i.fonte_url} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex items-center gap-1 underline">{i.fonte_nome}<ExternalLink size={12} aria-hidden /></a> : i.fonte_nome}
      {i.direitos && <> · {i.direitos}</>}
    </p>
  );
}

function Bloco({ tipo, item, editar, excluir, d }: { tipo: TipoLiturgia; item?: ItemLiturgia; editar: boolean; excluir: boolean; d: string }) {
  return (
    <Card title={TIPO_ROTULO[tipo]}>
      {item ? (
        <>
          <p className="font-medium">{item.titulo}</p>
          {item.texto && <p className="mt-2 whitespace-pre-line text-[15px] leading-relaxed">{item.texto}</p>}
          <Fonte i={item} />
          {editar && (
            <div className="mt-2 flex flex-wrap gap-2">
              <Link href={`?d=${d}&editar=${tipo}#editor`} className="inline-flex min-h-11 items-center rounded-lg border border-verde px-4 text-sm text-verde">Editar</Link>
              {excluir && <ActionForm action={excluirLiturgiaAction} submit="Remover" danger className="space-y-0"><input type="hidden" name="id" value={item.id} /></ActionForm>}
            </div>
          )}
        </>
      ) : (
        <p className="text-sm text-tinta/60">Ainda não cadastrado para este dia.
          {editar && <> <Link href={`?d=${d}&editar=${tipo}#editor`} className="text-verde underline">Cadastrar</Link></>}</p>
      )}
    </Card>
  );
}

export default async function Liturgia({ searchParams }: { searchParams: Promise<{ d?: string; editar?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const hoje = todayLocal();
  const d = sp.d && isDate(sp.d) ? sp.d : hoje;
  const [itens, fontes, editar, excluir] = await Promise.all([itensDoDia(d), listarFontes(), podeEditarLiturgia(user.id), can(user.id, "conteudos", "excluir", null)]);
  const prov = editar ? await getProvedor(user.id) : null;
  const dia = diaLiturgico(d);
  const por = new Map(itens.map((i) => [i.tipo, i]));
  const tipoEdit = (TIPOS_LITURGIA as readonly string[]).includes(sp.editar ?? "") ? (sp.editar as TipoLiturgia) : TIPOS_LITURGIA.find((t) => !por.has(t)) ?? "evangelho";
  const atual = por.get(tipoEdit);
  const santo = por.get("santo");
  return (
    <div className="space-y-4">
      <h1 className="font-titulo text-2xl text-verde">Liturgia</h1>
      <div className="flex items-center justify-between">
        <Link href={`?d=${addDays(d, -1)}`} aria-label="Dia anterior" className="flex min-h-11 min-w-11 items-center justify-center text-verde"><ChevronLeft /></Link>
        <div className="text-center"><p className="font-medium">{brDate(d)}</p>{d !== hoje && <Link href="?" className="text-xs text-verde underline">Ir para hoje</Link>}</div>
        <Link href={`?d=${addDays(d, 1)}`} aria-label="Próximo dia" className="flex min-h-11 min-w-11 items-center justify-center text-verde"><ChevronRight /></Link>
      </div>

      <Card>
        <div className="flex items-start gap-3">
          <span className={`mt-1 h-5 w-5 shrink-0 rounded-full ${COR[dia.cor]}`} role="img" aria-label={`Cor litúrgica: ${dia.cor}`} />
          <div>
            <p className="font-medium">{dia.titulo}</p>
            <p className="text-sm text-tinta/70">{dia.tempoNome} · Cor {dia.cor}</p>
            <p className="mt-1 flex flex-wrap gap-1"><Badge>Domingos: ano {dia.cicloDominical}</Badge><Badge>Dias de semana: ano {dia.cicloFerial}</Badge></p>
            <p className="mt-2 text-xs text-tinta/60">Calculado pelo calendário romano geral. Solenidades, festas e memórias do calendário local aparecem no cadastro do dia.</p>
          </div>
        </div>
      </Card>

      <h2 className="pt-2 font-titulo text-lg text-verde">Liturgia da Palavra</h2>
      {GRUPO_PALAVRA.map((t) => (t === "segunda_leitura" && !por.has(t) && !dia.domingo && !editar) ? null : <Bloco key={t} tipo={t} item={por.get(t)} editar={editar} excluir={excluir} d={d} />)}

      <h2 className="pt-2 font-titulo text-lg text-verde">Santo do dia</h2>
      <Bloco tipo="santo" item={santo} editar={editar} excluir={excluir} d={d} />

      <h2 className="pt-2 font-titulo text-lg text-verde">Liturgia das Horas</h2>
      {GRUPO_HORAS.map((t) => <Bloco key={t} tipo={t} item={por.get(t)} editar={editar} excluir={excluir} d={d} />)}

      <Card title="Fontes oficiais">
        {fontes.length === 0 ? <p className="text-sm text-tinta/60">Nenhuma fonte configurada ainda.</p> : (
          <ul className="divide-y divide-borda">
            {fontes.map((f) => (
              <li key={f.id} className="flex items-center justify-between gap-2 py-1">
                <a href={f.url} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex min-h-11 items-center gap-1 text-verde underline">{f.titulo}<ExternalLink size={14} aria-hidden /></a>
                {editar && <ActionForm action={removerFonteAction} submit="Remover" danger className="space-y-0"><input type="hidden" name="id" value={f.id} /></ActionForm>}
              </li>
            ))}
          </ul>
        )}
        {editar && (
          <ActionForm action={adicionarFonteAction} submit="Adicionar fonte" className="mt-3">
            <Field label="Nome (ex.: site oficial da liturgia diária)"><input name="titulo" required maxLength={120} className={inputCls} /></Field>
            <Field label="Endereço (https://…)"><input name="url" type="url" required className={inputCls} /></Field>
          </ActionForm>
        )}
      </Card>

      {editar && (
        <Card title="Importação automática">
          <p className="mb-3 text-xs text-tinta/70">Busca sozinha a liturgia de uma fonte que <strong>a comunidade tem autorização de usar</strong>. O app só consulta endereços públicos em HTTPS. O que foi cadastrado à mão nunca é sobrescrito. Use “Testar” para ver a prévia antes de ativar.</p>
          {prov && <p className="mb-3 rounded-lg bg-verde/10 px-3 py-2 text-xs">{prov.ativo ? "Ativa" : "Desativada"} · última execução: {prov.ultima_execucao ? `${brDate(utcToLocal(new Date(prov.ultima_execucao)).date)} ${utcToLocal(new Date(prov.ultima_execucao)).time}` : "nunca"}{prov.ultimo_status && ` · ${prov.ultimo_status}`}</p>}
          <ActionForm action={provedorAction} submit="Salvar configuração" resetOnOk={false}>
            <Field label="Nome da fonte (aparece em cada conteúdo)"><input name="fonteNome" required maxLength={160} defaultValue={prov?.fonte_nome} className={inputCls} /></Field>
            <Field label="Link público da fonte (opcional)"><input name="fonteUrlPublica" type="url" defaultValue={prov?.fonte_url_publica ?? ""} className={inputCls} /></Field>
            <Field label="Endereço da API (https://…; use {data}, {dd}, {mm}, {aaaa})"><input name="urlTemplate" required maxLength={600} defaultValue={prov?.url_template} placeholder="https://exemplo.org/liturgia?data={data}" className={inputCls} /></Field>
            <Field label="Mapeamento dos campos (JSON)"><textarea name="mapeamento" required rows={7} spellCheck={false} defaultValue={prov ? JSON.stringify(JSON.parse(prov.mapeamento), null, 2) : ""} placeholder={'{\n  "evangelho": { "titulo": "caminho.da.referencia", "texto": "caminho.do.texto" },\n  "santo": { "titulo": "caminho.do.nome" }\n}'} className={inputCls + " py-2 font-mono text-xs"} /></Field>
            <p className="text-xs text-tinta/60">Cada chave é um tipo ({TIPOS_LITURGIA.join(", ")}); “titulo” e “texto” são caminhos no JSON da fonte (ex.: <code>leituras.evangelho.0.referencia</code>).</p>
            <Field label="Importar hoje e os próximos (dias)"><input name="diasAFrente" type="number" min={0} max={7} defaultValue={prov?.dias_a_frente ?? 2} className={inputCls} /></Field>
            <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" name="copiarTexto" defaultChecked={Boolean(prov?.copiar_texto)} className="h-5 w-5" /> Copiar também o texto completo (senão, só a referência e o link da fonte)</label>
            <label className="flex items-start gap-2 text-sm"><input type="checkbox" name="direitosConfirmados" defaultChecked={Boolean(prov?.direitos_confirmados)} className="mt-1 h-5 w-5 shrink-0" /> <span>Confirmo que a comunidade tem autorização para reproduzir o texto desta fonte (obrigatório para copiar o texto).</span></label>
            <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" name="ativo" defaultChecked={Boolean(prov?.ativo)} className="h-5 w-5" /> Ativar importação automática</label>
            <button type="submit" name="acao" value="testar" className="min-h-11 rounded-lg border border-verde px-4 text-sm text-verde">Testar com a data de hoje (sem salvar)</button>
          </ActionForm>
          {prov && <ActionForm action={importarAgoraAction} submit="Importar agora" className="mt-3"><span /></ActionForm>}
        </Card>
      )}

      {editar && (
        <Card title="Cadastrar ou editar conteúdo" className="scroll-mt-20">
          <div id="editor" />
          <p className="mb-3 rounded-lg bg-amber-50 p-3 text-xs text-amber-900">Os textos litúrgicos em português costumam ter direitos autorais. Cadastre apenas conteúdo que a comunidade tem autorização para reproduzir e sempre informe a fonte. Na dúvida, use apenas a referência e o link.</p>
          <ActionForm action={salvarLiturgiaAction} submit="Salvar conteúdo" resetOnOk={false} key={`${d}-${tipoEdit}`}>
            <input type="hidden" name="data" value={d} />
            <Field label="Tipo"><select name="tipo" defaultValue={tipoEdit} className={inputCls}>{TIPOS_LITURGIA.map((t) => <option key={t} value={t}>{TIPO_ROTULO[t]}</option>)}</select></Field>
            <Field label="Título ou referência"><input name="titulo" required maxLength={200} defaultValue={atual?.titulo} className={inputCls} /></Field>
            <Field label="Texto (opcional)"><textarea name="texto" rows={6} maxLength={60000} defaultValue={atual?.texto ?? ""} className={inputCls + " py-2"} /></Field>
            <Field label="Fonte (obrigatória)"><input name="fonteNome" required maxLength={160} defaultValue={atual?.fonte_nome} className={inputCls} /></Field>
            <Field label="Link da fonte (opcional)"><input name="fonteUrl" type="url" defaultValue={atual?.fonte_url ?? ""} className={inputCls} /></Field>
            <Field label="Direitos / autorização (opcional)"><input name="direitos" maxLength={300} defaultValue={atual?.direitos ?? ""} className={inputCls} /></Field>
          </ActionForm>
        </Card>
      )}
    </div>
  );
}
