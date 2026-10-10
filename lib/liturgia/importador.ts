/**
 * Importação de liturgia: funções puras e busca HTTP segura (anti-SSRF).
 * O servidor só busca endereços PÚBLICOS em HTTPS; cada redirecionamento é revalidado e a conexão é fixada
 * ao IP já verificado (evita "DNS rebinding").
 */
import dns from "node:dns/promises";
import http from "node:http";
import https from "node:https";
import net from "node:net";

/* ---------- Modelo ---------- */
export type MapaCampo = { titulo: string; texto?: string };
export type Mapeamento = Partial<Record<string, MapaCampo>>;
export type ItemExtraido = { tipo: string; titulo: string; texto: string | null };

/* ---------- Extração e limpeza ---------- */
/** Caminho com pontos e índices: "leituras.primeiraLeitura.0.referencia". Apenas leitura (sem prototype). */
export function extrair(obj: unknown, caminho: string): unknown {
  let atual: unknown = obj;
  for (const parte of caminho.split(".")) {
    if (atual == null || typeof atual !== "object") return undefined;
    if (parte === "__proto__" || parte === "constructor" || parte === "prototype") return undefined;
    atual = Object.prototype.hasOwnProperty.call(atual, parte) ? (atual as Record<string, unknown>)[parte] : undefined;
  }
  return atual;
}

const ENTIDADES: Record<string, string> = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'", "&nbsp;": " ", "&apos;": "'" };
/** Converte HTML simples em texto puro (o app só exibe texto escapado; isto evita mostrar tags). */
export function limparTexto(valor: unknown, max: number): string | null {
  const bruto = Array.isArray(valor) ? valor.filter((v) => typeof v === "string").join("\n\n") : typeof valor === "string" ? valor : typeof valor === "number" ? String(valor) : null;
  if (bruto == null) return null;
  const t = bruto
    .replace(/<\s*br\s*\/?>/gi, "\n").replace(/<\/\s*(p|div|li|h[1-6])\s*>/gi, "\n\n")
    .replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<style[\s\S]*?<\/style>/gi, "").replace(/<[^>]*>/g, "")
    .replace(/&(amp|lt|gt|quot|#39|nbsp|apos);/g, (m) => ENTIDADES[m] ?? m)
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  return t ? t.slice(0, max) : null;
}

export function itensDoJson(json: unknown, mapa: Mapeamento, copiarTexto: boolean): ItemExtraido[] {
  const out: ItemExtraido[] = [];
  for (const [tipo, campo] of Object.entries(mapa)) {
    if (!campo) continue;
    const titulo = limparTexto(extrair(json, campo.titulo), 200);
    if (!titulo) continue; // sem título nesta data: ignora o tipo, sem erro
    const texto = copiarTexto && campo.texto ? limparTexto(extrair(json, campo.texto), 60000) : null;
    out.push({ tipo, titulo, texto });
  }
  return out;
}

/* ---------- URL ---------- */
export function montarUrl(template: string, data: string): string {
  const [a, m, d] = data.split("-");
  return template.replace(/\{(data|aaaa|ano|mm|mes|dd|dia)\}/g, (_, k: string) => ({ data, aaaa: a, ano: a, mm: m, mes: m, dd: d, dia: d } as Record<string, string>)[k]);
}

export function ipPrivado(ip: string): boolean {
  if (net.isIPv6(ip)) {
    const l = ip.toLowerCase();
    if (l === "::1" || l === "::" || l.startsWith("fe80") || l.startsWith("fc") || l.startsWith("fd") || l.startsWith("ff")) return true;
    const mapeado = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(l);
    return mapeado ? ipPrivado(mapeado[1]) : false;
  }
  const p = ip.split(".").map(Number);
  if (p.length !== 4 || p.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true;
  const [a, b] = p;
  return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || (a === 192 && b === 0) || (a === 198 && (b === 18 || b === 19)) || a >= 224;
}

export type Resolver = (host: string) => Promise<string[]>;
const resolverPadrao: Resolver = async (host) => (await dns.lookup(host, { all: true })).map((r) => r.address);
export const redeLocalPermitida = () => process.env.NODE_ENV !== "production" && process.env.LITURGIA_PERMITIR_REDE_LOCAL === "1";

/** Valida a URL e devolve o IP público a ser usado. Lança Error com mensagem segura em caso de recusa. */
export async function validarDestino(urlStr: string, resolver: Resolver = resolverPadrao): Promise<{ url: URL; ip: string }> {
  let url: URL;
  try { url = new URL(urlStr); } catch { throw new Error("Endereço inválido."); }
  const local = redeLocalPermitida();
  if (url.protocol !== "https:" && !(local && url.protocol === "http:")) throw new Error("A fonte precisa usar HTTPS.");
  if (url.username || url.password) throw new Error("O endereço não pode conter usuário e senha.");
  if (url.port && !local && !["443", ""].includes(url.port)) throw new Error("Porta não permitida.");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  const ips = net.isIP(host) ? [host] : await resolver(host).catch(() => { throw new Error("Não foi possível resolver o endereço da fonte."); });
  if (ips.length === 0) throw new Error("Não foi possível resolver o endereço da fonte.");
  if (!local && ips.some(ipPrivado)) throw new Error("Endereço não permitido (rede interna).");
  return { url, ip: ips[0] };
}

/* ---------- Busca HTTP segura ---------- */
export type Buscador = (url: string) => Promise<unknown>;
const LIMITE_BYTES = 1_000_000;

function requisitar(url: URL, ip: string): Promise<{ status: number; location?: string; corpo: string }> {
  return new Promise((resolve, reject) => {
    const mod = url.protocol === "https:" ? https : http;
    const req = mod.request(url, {
      method: "GET", timeout: 10_000, headers: { Accept: "application/json", "User-Agent": "NovaBerith-Liturgia/1.0" },
      // conexão fixada no IP já validado; o nome do host segue para o TLS (SNI/certificado)
      lookup: (_h, _o, cb) => (_o && (_o as { all?: boolean }).all ? (cb as unknown as (e: null, r: { address: string; family: number }[]) => void)(null, [{ address: ip, family: net.isIP(ip) }]) : cb(null, ip, net.isIP(ip))),
    }, (res) => {
      const partes: Buffer[] = []; let total = 0;
      res.on("data", (c: Buffer) => { total += c.length; if (total > LIMITE_BYTES) { req.destroy(new Error("Resposta grande demais.")); return; } partes.push(c); });
      res.on("end", () => resolve({ status: res.statusCode ?? 0, location: res.headers.location, corpo: Buffer.concat(partes).toString("utf8") }));
      res.on("error", reject);
    });
    req.on("timeout", () => req.destroy(new Error("Tempo esgotado ao consultar a fonte.")));
    req.on("error", reject);
    req.end();
  });
}

export const buscarJson: Buscador = async (urlInicial) => {
  let atual = urlInicial;
  for (let salto = 0; salto <= 2; salto++) {
    const { url, ip } = await validarDestino(atual);
    const r = await requisitar(url, ip);
    if (r.status >= 300 && r.status < 400 && r.location) { atual = new URL(r.location, url).toString(); continue; } // cada redirecionamento é revalidado
    if (r.status < 200 || r.status >= 300) throw new Error(`A fonte respondeu com erro ${r.status}.`);
    try { return JSON.parse(r.corpo); } catch { throw new Error("A fonte não devolveu JSON válido."); }
  }
  throw new Error("Redirecionamentos demais.");
};
