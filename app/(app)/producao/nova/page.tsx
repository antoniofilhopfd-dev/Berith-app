import Link from "next/link";
import { requireUser } from "@/lib/auth/session";
import { exigir } from "@/lib/auth/pagina";
import { opcoesProducao } from "@/lib/services/opcoes";
import { listarModelos } from "@/lib/services/publicacoes";
import { contasInstagram, nomesContas } from "@/lib/integracoes/contas";
import { contaParaFiltro } from "@/lib/auth/conta";
import { EditorPublicacao } from "@/components/editor-publicacao";
import { PageHeader } from "@/components/ui";
import { inicialVazio } from "@/lib/producao-ui";
import { isDate } from "@/lib/time";
import { autosalvarAction, salvarPublicacaoAction } from "../actions";

export const metadata = { title: "Nova produção" };

export default async function NovaProducao({ searchParams }: { searchParams: Promise<{ data?: string }> }) {
  const user = await requireUser();
  await exigir(user.id, "producao", "criar");
  const sp = await searchParams;
  const [op, modelos] = await Promise.all([opcoesProducao(user.id), listarModelos(user.id)]);
  const data = sp.data && isDate(sp.data) ? sp.data : "";
  return (
    <div>
      <PageHeader titulo="Nova produção" sub="Crie o conteúdo, escolha as redes e veja a pré-visualização ao lado.">
        {modelos.length > 0 && <Link href="/producao/modelos" className="text-sm text-verde-escuro underline">Começar de um modelo ({modelos.length})</Link>}
      </PageHeader>
      <EditorPublicacao
        inicial={inicialVazio({ responsavelId: user.id, publicarData: data, publicarHora: data ? (op.config.horariosSugeridos[0] ?? "") : "", hashtags: op.config.hashtagsPadrao, ...((await contaParaFiltro()) ? { contaPorRede: { instagram: (await contaParaFiltro())! } } : {}) })}
        campanhas={op.campanhas} editorias={op.editorias} pessoas={op.pessoas} conta={op.contaNome} contas={await nomesContas()} contasIg={await contasInstagram()}
        recentes={op.recentes} salvar={salvarPublicacaoAction} autosalvar={null} hashtagsPadrao={op.config.hashtagsPadrao} />
    </div>
  );
}
