// Sem dependências de servidor: usado também pelo proxy.ts.
export const SESSION_COOKIE = process.env.NODE_ENV === "production" ? "__Host-nb_session" : "nb_session";
export const SESSION_DAYS = 7;
export const PUBLIC_PATHS = ["/login", "/recuperar-senha", "/redefinir-senha", "/convite", "/privacidade"];

/** Aceita apenas caminhos internos ("/x"); recusa URLs externas, "//host" e barras invertidas (open redirect). */
export function safeNext(next: unknown): string {
  const n = typeof next === "string" ? next : "";
  return n.startsWith("/") && !n.startsWith("//") && !n.includes("\\") && !/[\r\n]/.test(n) && n.length < 400 ? n : "/";
}
