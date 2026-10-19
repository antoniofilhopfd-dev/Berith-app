import { NextResponse, type NextRequest } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { baseUrl } from "@/lib/auth/guard";
import { concluirConexao } from "@/lib/integracoes/contas";
import { REDES_ATIVAS, type Rede } from "@/lib/editorial";
import { DomainError } from "@/lib/services/errors";
import { ForbiddenError } from "@/lib/permissions";

export const dynamic = "force-dynamic";

/** Retorno do OAuth das redes sociais: exige sessão, valida o state (uso único) e guarda os tokens cifrados. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ rede: string }> }) {
  const base = await baseUrl();
  const voltar = (q: string) => NextResponse.redirect(`${base}/configuracoes/redes?${q}`, { headers: { "Cache-Control": "no-store" } });
  const user = await getSessionUser();
  if (!user) return NextResponse.redirect(`${base}/login`);
  const rede = (await params).rede as Rede;
  if (!REDES_ATIVAS.includes(rede)) return voltar("erro=" + encodeURIComponent("Rede desconhecida."));
  const sp = req.nextUrl.searchParams;
  if (sp.get("error")) return voltar("erro=" + encodeURIComponent("A autorização foi negada ou cancelada na rede social."));
  const code = sp.get("code"), state = sp.get("state");
  if (!code || !state || code.length > 2048 || state.length > 200) return voltar("erro=" + encodeURIComponent("Resposta de autorização incompleta."));
  try {
    const r = await concluirConexao(user.id, rede, state, code, base);
    return voltar("ok=" + encodeURIComponent(`Conta ${r.nome} conectada.`));
  } catch (e) {
    if (e instanceof DomainError) return voltar("erro=" + encodeURIComponent(e.message));
    if (e instanceof ForbiddenError) return voltar("erro=" + encodeURIComponent("Apenas administradores conectam redes."));
    console.error("[oauth-callback]", e instanceof Error ? e.message : "erro");
    return voltar("erro=" + encodeURIComponent("Não foi possível concluir a conexão."));
  }
}
