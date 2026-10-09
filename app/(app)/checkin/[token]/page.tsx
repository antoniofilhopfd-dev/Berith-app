import Link from "next/link";
import { requireUser } from "@/lib/auth/session";
import { checkin } from "@/lib/services/presencas";
import { DomainError, NotFoundError } from "@/lib/services/errors";
import { Card } from "@/components/ui";
import { brDate } from "@/lib/time";

export const dynamic = "force-dynamic";

export default async function Checkin({ params }: { params: Promise<{ token: string }> }) {
  const user = await requireUser();
  const { token } = await params;
  let msg: { ok: boolean; texto: string };
  try {
    const r = await checkin(user.id, decodeURIComponent(token));
    msg = { ok: true, texto: r.jaRegistrado ? `Sua presença em "${r.titulo}" (${brDate(r.date)}) já estava registrada.` : `Presença registrada em "${r.titulo}" (${brDate(r.date)}). Obrigado!` };
  } catch (e) {
    if (e instanceof DomainError) msg = { ok: false, texto: e.message };
    else if (e instanceof NotFoundError) msg = { ok: false, texto: "Código inválido ou evento indisponível para você." };
    else throw e;
  }
  return (
    <Card title="Check-in">
      <p role={msg.ok ? "status" : "alert"} className={`rounded-lg px-3 py-2 text-sm ${msg.ok ? "bg-green-50 text-green-800" : "bg-red-50 text-red-800"}`}>{msg.texto}</p>
      <Link href="/" className="mt-3 inline-flex min-h-11 items-center text-sm text-verde">Ir para o início</Link>
    </Card>
  );
}
