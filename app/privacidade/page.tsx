import Link from "next/link";
import { PublicShell } from "@/components/public-shell";

export default function Privacidade() {
  return (
    <PublicShell titulo="Aviso de privacidade">
      <div className="space-y-3 text-sm">
        <p>Este aplicativo é de uso exclusivo da equipe do Ministério de Comunicação da Comunidade Católica Nova Berith. Coletamos apenas o necessário para o trabalho: nome, e-mail, telefone (opcional), o perfil de acesso e o registro das ações realizadas no app (auditoria).</p>
        <p>Os acessos às redes sociais da comunidade (Instagram) são feitos pelas APIs oficiais, com autorização de um administrador. Os tokens ficam cifrados e podem ser revogados a qualquer momento em Configurações. O app lê apenas as métricas que as próprias plataformas disponibilizam.</p>
        <p>Imagens e vídeos enviados ficam em armazenamento privado e só são acessíveis por quem tem permissão. Cuide para que haja autorização de uso de imagem das pessoas retratadas e dos responsáveis, no caso de crianças e adolescentes.</p>
        <p>Você pode atualizar seus dados no perfil e pedir correção ou exclusão a um administrador.</p>
        <p className="text-xs text-tinta/60">Texto-base para revisão pela coordenação e por assessoria jurídica antes da publicação.</p>
      </div>
      <Link href="/login" className="mt-4 inline-flex min-h-11 items-center text-sm text-verde">← Voltar</Link>
    </PublicShell>
  );
}
