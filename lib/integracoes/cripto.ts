import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/** Tokens de redes sociais ficam no banco SEMPRE cifrados (AES-256-GCM). A chave vem de TOKEN_ENC_KEY (nunca do código). */
function chave(): Buffer {
  const k = process.env.TOKEN_ENC_KEY;
  if (!k || k.length < 32) throw new Error("TOKEN_ENC_KEY ausente ou curta (mínimo 32 caracteres). Gere com: npm run gerar:segredo");
  return createHash("sha256").update(k).digest();
}
export const cifraDisponivel = () => Boolean(process.env.TOKEN_ENC_KEY && process.env.TOKEN_ENC_KEY.length >= 32);

export function cifrar(texto: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", chave(), iv);
  const enc = Buffer.concat([c.update(texto, "utf8"), c.final()]);
  return ["v1", iv.toString("base64url"), c.getAuthTag().toString("base64url"), enc.toString("base64url")].join(":");
}

export function decifrar(valor: string): string {
  const [v, iv, tag, enc] = valor.split(":");
  if (v !== "v1" || !iv || !tag || !enc) throw new Error("Formato de token inválido.");
  const d = createDecipheriv("aes-256-gcm", chave(), Buffer.from(iv, "base64url"));
  d.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([d.update(Buffer.from(enc, "base64url")), d.final()]).toString("utf8");
}

/** Mascara qualquer token em mensagens/logs. */
export const mascarar = (s: string) => s.replace(/(access_token|refresh_token|client_secret|code|token)=([^&\s"']+)/gi, "$1=***").replace(/(Bearer\s+)[A-Za-z0-9._~+/-]+=*/g, "$1***");
