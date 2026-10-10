import { NextResponse, type NextRequest } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { marcarLida } from "@/lib/services/notificacoes";
import { query } from "@/lib/db";
import { safeNext } from "@/lib/auth/constants";
import type { RowDataPacket } from "mysql2/promise";

export const dynamic = "force-dynamic";

/** Marca a notificação (do próprio usuário) como lida e segue para o destino interno. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.redirect(new URL("/login", req.url));
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) return NextResponse.redirect(new URL("/notificacoes", req.url));
  const r = await query<RowDataPacket>("SELECT url FROM notificacoes WHERE id = ? AND user_id = ?", [id, user.id]);
  if (!r[0]) return NextResponse.redirect(new URL("/notificacoes", req.url));
  await marcarLida(user.id, id);
  return NextResponse.redirect(new URL(safeNext(r[0].url), req.url));
}
