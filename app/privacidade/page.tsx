import Link from "next/link";
import { PublicShell } from "@/components/public-shell";

export default function Privacidade() {
  return (
    <PublicShell titulo="Aviso de privacidade">
      <div className="space-y-3 text-sm">
        <p>Este aplicativo é de uso exclusivo dos membros da Comunidade Católica Nova Berith. Coletamos apenas o necessário: nome, e-mail, telefone (opcional) e os vínculos com as estruturas da comunidade.</p>
        <p>Como a participação em uma comunidade religiosa pode revelar convicção religiosa (dado pessoal sensível, LGPD art. 5º, II), esses dados são visíveis apenas às coordenações das estruturas em que você participa e não são usados para qualquer classificação de pessoas.</p>
        <p>Você pode atualizar seus dados no perfil e pedir correção ou exclusão à coordenação geral. Dados de crianças e adolescentes exigem autorização dos responsáveis.</p>
        <p className="text-xs text-tinta/60">Texto-base para revisão pela coordenação e por assessoria jurídica antes da publicação.</p>
      </div>
      <Link href="/login" className="mt-4 inline-flex min-h-11 items-center text-sm text-verde">← Voltar</Link>
    </PublicShell>
  );
}
