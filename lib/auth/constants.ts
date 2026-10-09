// Sem dependências de servidor: usado também pelo proxy.ts.
export const SESSION_COOKIE = process.env.NODE_ENV === "production" ? "__Host-nb_session" : "nb_session";
export const SESSION_DAYS = 7;
export const PUBLIC_PATHS = ["/login", "/recuperar-senha", "/redefinir-senha", "/convite", "/privacidade"];
