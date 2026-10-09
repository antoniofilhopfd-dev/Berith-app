import { notFound } from "next/navigation";
import Link from "next/link";
import QRCode from "qrcode";
import { requireUser } from "@/lib/auth/session";
import { checkinToken } from "@/lib/services/presencas";
import { baseUrl } from "@/lib/auth/guard";
import { getEvent } from "@/lib/services/eventos";
import { NotFoundError, DomainError } from "@/lib/services/errors";
import { ForbiddenError } from "@/lib/permissions";
import { brDate, isDate, utcToLocal } from "@/lib/time";
import { Card } from "@/components/ui";

export default async function QrPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ d?: string }> }) {
  const user = await requireUser();
  const id = Number((await params).id);
  const sp = await searchParams;
  if (!Number.isInteger(id) || id <= 0) notFound();
  let svg, ev, date, url;
  try {
    ev = await getEvent(user.id, id);
    date = sp.d && isDate(sp.d) ? sp.d : utcToLocal(ev.inicio).date;
    const token = await checkinToken(user.id, id, date);
    url = `${await baseUrl()}/checkin/${token}`;
    svg = await QRCode.toString(url, { type: "svg", margin: 1, width: 280, errorCorrectionLevel: "M" });
  } catch (e) {
    if (e instanceof NotFoundError || e instanceof ForbiddenError || e instanceof DomainError) notFound();
    throw e;
  }
  return (
    <div className="space-y-4">
      <Link href={`/eventos/${id}/presencas?d=${date}`} className="inline-flex min-h-11 items-center text-sm text-verde">← Chamada</Link>
      <Card title={`Check-in: ${ev.titulo}`}>
        <p className="mb-3 text-sm text-tinta/70">{brDate(date)} · Peça aos participantes que leiam o código com a câmera do celular e entrem com a própria conta. Vale só para esta data e por tempo limitado.</p>
        <div className="mx-auto w-fit rounded-xl border border-borda bg-white p-2" role="img" aria-label="QR Code de check-in" dangerouslySetInnerHTML={{ __html: svg }} />
        <label className="mt-3 block text-xs text-tinta/60">Ou compartilhe este link (exige login):
          <input readOnly value={url} aria-label="Link de check-in" className="mt-1 min-h-11 w-full rounded border border-borda bg-white px-2 text-xs" />
        </label>
      </Card>
    </div>
  );
}
