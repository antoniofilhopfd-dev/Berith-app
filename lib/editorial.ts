/** Regras editoriais puras (sem banco/servidor): usadas no servidor, nos testes e nas telas. */

export const REDES = ["instagram", "facebook", "tiktok", "youtube"] as const;
export type Rede = (typeof REDES)[number];
export const REDE_ROTULO: Record<Rede, string> = { instagram: "Instagram", facebook: "Facebook", tiktok: "TikTok", youtube: "YouTube" };

export const FORMATOS = ["post", "carrossel", "stories", "reels", "video", "short"] as const;
export type Formato = (typeof FORMATOS)[number];
export const FORMATO_ROTULO: Record<Formato, string> = { post: "Post", carrossel: "Carrossel", stories: "Stories", reels: "Reels", video: "Vídeo", short: "Shorts" };

export const STATUS = ["rascunho", "em_producao", "em_revisao", "ajustes_solicitados", "aprovado", "agendado", "publicado", "cancelado"] as const;
export type Status = (typeof STATUS)[number];
export const STATUS_ROTULO: Record<Status, string> = {
  rascunho: "Rascunho", em_producao: "Em produção", em_revisao: "Em revisão", ajustes_solicitados: "Ajustes solicitados",
  aprovado: "Aprovado", agendado: "Agendado", publicado: "Publicado", cancelado: "Cancelado",
};
export const STATUS_TOM: Record<Status, "cinza" | "azul" | "amarelo" | "cobre" | "verde" | "vermelho"> = {
  rascunho: "cinza", em_producao: "azul", em_revisao: "amarelo", ajustes_solicitados: "cobre", aprovado: "verde", agendado: "verde", publicado: "verde", cancelado: "vermelho",
};
export const PRIORIDADES = ["baixa", "media", "alta"] as const;
export type Prioridade = (typeof PRIORIDADES)[number];
export const PRIORIDADE_ROTULO: Record<Prioridade, string> = { baixa: "Baixa", media: "Média", alta: "Alta" };

/** Formatos aceitos por cada rede (limitações das APIs oficiais). */
export const FORMATOS_POR_REDE: Record<Rede, readonly Formato[]> = {
  instagram: ["post", "carrossel", "stories", "reels"],
  facebook: ["post", "carrossel", "stories", "reels", "video"],
  tiktok: ["video", "reels", "short"],
  youtube: ["video", "short"],
};

/** Limites de texto por rede (caracteres). */
export const LIMITES: Record<Rede, { legenda: number; titulo?: number; hashtags?: number }> = {
  instagram: { legenda: 2200, hashtags: 30 },
  facebook: { legenda: 63206 },
  tiktok: { legenda: 2200 },
  youtube: { legenda: 5000, titulo: 100 },
};

/** Transições permitidas do fluxo de aprovação (o servidor ainda confere permissão e regras). */
export const TRANSICOES: Record<Status, readonly Status[]> = {
  rascunho: ["em_producao", "em_revisao", "cancelado"],
  em_producao: ["em_revisao", "cancelado", "rascunho"],
  em_revisao: ["aprovado", "ajustes_solicitados", "em_producao", "cancelado"],
  ajustes_solicitados: ["em_producao", "em_revisao", "cancelado"],
  aprovado: ["agendado", "em_producao", "cancelado"],
  agendado: ["aprovado", "em_producao", "publicado", "cancelado"],
  publicado: [],
  cancelado: ["rascunho"],
};

/** Campos cuja alteração invalida uma aprovação já dada. */
export const CAMPOS_DE_CONTEUDO = ["titulo", "descricao", "objetivo", "formato", "legenda", "hashtags", "redes", "midiaIds"] as const;

export const contarCaracteres = (s: string | null | undefined) => Array.from(s ?? "").length;

/** Extrai, normaliza e deduplica hashtags de um texto livre ("a b #c" → ["#a","#b","#c"] só com #). */
export function normalizarHashtags(texto: string | null | undefined): string[] {
  const out: string[] = [];
  for (const t of (texto ?? "").split(/[\s,;]+/)) {
    const m = /^#?([\p{L}\p{N}_]{1,100})$/u.exec(t.trim());
    if (!m) continue;
    const h = `#${m[1]}`;
    if (!out.some((x) => x.toLowerCase() === h.toLowerCase())) out.push(h);
  }
  return out;
}

export type DadosConteudo = {
  titulo: string; formato: Formato; legenda: string | null; hashtags: string | null;
  redes: { rede: Rede; legenda?: string | null; hashtags?: string | null; tituloExterno?: string | null }[];
  midias: { id: number; tipo: "imagem" | "video"; largura?: number | null; altura?: number | null }[];
};

/** Texto final de uma rede: legenda própria ou herdada + hashtags. */
export function textoDaRede(d: Pick<DadosConteudo, "legenda" | "hashtags">, r: { legenda?: string | null; hashtags?: string | null }): string {
  const leg = (r.legenda ?? d.legenda ?? "").trim();
  const tags = normalizarHashtags(r.hashtags ?? d.hashtags).join(" ");
  return [leg, tags].filter(Boolean).join("\n\n");
}

/** Problemas que impedem enviar para revisão/agendar. Lista vazia = conteúdo pronto. */
export function problemasDoConteudo(d: DadosConteudo): string[] {
  const p: string[] = [];
  if (d.titulo.trim().length < 2) p.push("Informe o título interno.");
  if (d.redes.length === 0) p.push("Escolha ao menos uma rede social.");
  const imgs = d.midias.filter((m) => m.tipo === "imagem").length, vids = d.midias.filter((m) => m.tipo === "video").length;
  switch (d.formato) {
    case "post": {
      const soFacebook = d.redes.length > 0 && d.redes.every((r) => r.rede === "facebook");
      if (vids > 0) p.push("Post: use somente imagens (para vídeo, escolha Reels ou Vídeo).");
      else if (imgs < 1 && !soFacebook) p.push("Post: use ao menos 1 imagem.");
      break;
    }
    case "carrossel": if (d.midias.length < 2 || d.midias.length > 10) p.push("Carrossel: use de 2 a 10 mídias."); break;
    case "stories": if (d.midias.length !== 1) p.push("Stories: use exatamente 1 mídia."); break;
    case "reels": case "video": case "short": if (vids !== 1 || imgs > 0) p.push(`${FORMATO_ROTULO[d.formato]}: use exatamente 1 vídeo.`); break;
  }
  for (const r of d.redes) {
    if (!FORMATOS_POR_REDE[r.rede].includes(d.formato)) p.push(`${REDE_ROTULO[r.rede]} não aceita o formato ${FORMATO_ROTULO[d.formato]}.`);
    const lim = LIMITES[r.rede];
    const tag = normalizarHashtags(r.hashtags ?? d.hashtags);
    if (contarCaracteres(textoDaRede(d, r)) > lim.legenda) p.push(`${REDE_ROTULO[r.rede]}: texto acima de ${lim.legenda} caracteres.`);
    if (lim.hashtags && tag.length > lim.hashtags) p.push(`${REDE_ROTULO[r.rede]}: no máximo ${lim.hashtags} hashtags.`);
    if (lim.titulo) {
      const t = (r.tituloExterno || d.titulo).trim();
      if (!t) p.push(`${REDE_ROTULO[r.rede]}: informe o título do vídeo.`);
      else if (contarCaracteres(t) > lim.titulo) p.push(`${REDE_ROTULO[r.rede]}: título acima de ${lim.titulo} caracteres.`);
    }
  }
  return [...new Set(p)];
}

/* ---- Comparação de versões (diff por linha e palavra) ---- */
export type Trecho = { tipo: "igual" | "removido" | "adicionado"; texto: string };

/** Diff por palavras (LCS). Entradas grandes são limitadas para manter custo previsível. */
export function diffPalavras(a: string, b: string): Trecho[] {
  const A = a.split(/(\s+)/).filter((x) => x !== ""), B = b.split(/(\s+)/).filter((x) => x !== "");
  if (A.length * B.length > 4_000_000) return a === b ? [{ tipo: "igual", texto: a }] : [{ tipo: "removido", texto: a }, { tipo: "adicionado", texto: b }];
  const n = A.length, m = B.length;
  const L: Uint32Array[] = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i][j] = A[i] === B[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  const out: Trecho[] = [];
  const push = (tipo: Trecho["tipo"], texto: string) => { const u = out[out.length - 1]; if (u && u.tipo === tipo) u.texto += texto; else out.push({ tipo, texto }); };
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (A[i] === B[j]) { push("igual", A[i]); i++; j++; }
    else if (L[i + 1][j] >= L[i][j + 1]) { push("removido", A[i]); i++; }
    else { push("adicionado", B[j]); j++; }
  }
  while (i < n) push("removido", A[i++]);
  while (j < m) push("adicionado", B[j++]);
  return out;
}
