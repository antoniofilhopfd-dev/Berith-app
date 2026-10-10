import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

/** Chave PÚBLICA VAPID (necessária ao navegador para assinar). Nunca expõe a chave privada. */
export async function GET() {
  if (!(await getSessionUser())) return NextResponse.json({ erro: "Sessão expirada." }, { status: 401, headers: { "Cache-Control": "no-store" } });
  return NextResponse.json({ chave: process.env.VAPID_PUBLIC_KEY ?? null }, { headers: { "Cache-Control": "no-store" } });
}
