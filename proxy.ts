import { NextResponse, type NextRequest } from "next/server";
import { PUBLIC_PATHS, SESSION_COOKIE } from "@/lib/auth/constants";

/**
 * Primeira barreira apenas (presença do cookie). A validação real da sessão e a
 * autorização acontecem em cada página, Server Action e Route Handler.
 */
export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const publico = PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"));
  if (publico || !pathname || pathname.startsWith("/api/")) return NextResponse.next();
  if (!req.cookies.get(SESSION_COOKIE)?.value) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/|favicon.ico|manifest.webmanifest|sw.js|icons/|.*\\.(?:png|jpg|svg|ico|webp)$).*)"],
};
