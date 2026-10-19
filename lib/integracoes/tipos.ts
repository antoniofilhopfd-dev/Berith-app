import type { Formato, Rede } from "@/lib/editorial";

export type MidiaPublicavel = { id: number; tipo: "imagem" | "video"; mime: string; nome: string; largura: number | null; altura: number | null; tamanho: number; url: string; caminhoArquivo: string };
export type ConteudoPublicar = { publicacaoId: number; redeId: number; rede: Rede; formato: Formato; titulo: string; texto: string; midias: MidiaPublicavel[] };
export type ContaAtiva = { rede: Rede; contaExternaId: string | null; nome: string | null; token: string; meta: Record<string, string> };

export type ResultadoPublicacao =
  | { ok: true; idExterno: string; url?: string | null }
  | { ok: false; erro: string; httpStatus?: number; /** não adianta tentar de novo sem ação humana */ definitivo?: boolean; /** token inválido: pedir reconexão */ reconectar?: boolean };

export type MetricasColetadas = {
  alcance?: number | null; impressoes?: number | null; curtidas?: number | null; comentarios?: number | null;
  compartilhamentos?: number | null; salvamentos?: number | null; visualizacoes?: number | null;
};
export type MetricasConta = { seguidores?: number | null; alcance?: number | null; visualizacoes?: number | null };

export type PostExterno = {
  idExterno: string; tipo: string | null; legenda: string | null; url: string | null; publicadoEm: Date;
} & MetricasColetadas;

export type TokensOAuth = { accessToken: string; refreshToken?: string | null; expiraEm?: Date | null; escopos?: string | null };
export type PerfilConta = { contaExternaId: string; nome: string; meta?: Record<string, string> };

export interface Provedor {
  rede: Rede;
  /** Credenciais do app (id/segredo) presentes no ambiente? */
  configurado(): boolean;
  /** Variáveis de ambiente necessárias (para orientar o administrador). */
  variaveis(): string[];
  escopos(): string[];
  urlAutorizacao(o: { state: string; redirectUri: string; verificador?: string }): string;
  trocarCodigo(o: { code: string; redirectUri: string; verificador?: string }): Promise<{ tokens: TokensOAuth; perfil: PerfilConta }>;
  renovar(o: { refreshToken: string | null; token: string; meta: Record<string, string> }): Promise<TokensOAuth>;
  publicar(conta: ContaAtiva, c: ConteudoPublicar): Promise<ResultadoPublicacao>;
  metricasPublicacao(conta: ContaAtiva, idExterno: string, formato: Formato): Promise<MetricasColetadas | null>;
  metricasConta(conta: ContaAtiva): Promise<MetricasConta | null>;
  /** Posts recentes da conta inteira (inclusive os publicados fora do app) com suas métricas. */
  listarPostsConta?(conta: ContaAtiva, desde: Date, limite: number): Promise<PostExterno[]>;
  /** Usa PKCE (code_verifier)? */
  pkce?: boolean;
}
