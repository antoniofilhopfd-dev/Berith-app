import { Badge } from "./ui";
import { FORMATO_ROTULO, PRIORIDADE_ROTULO, REDE_ROTULO, STATUS_ROTULO, STATUS_TOM, type Formato, type Prioridade, type Rede, type Status } from "@/lib/editorial";

export const StatusBadge = ({ status }: { status: Status }) => <Badge tom={STATUS_TOM[status]}>{STATUS_ROTULO[status]}</Badge>;

/** Cores de identificação das redes (somente apoio visual; a informação sempre vem também em texto). */
export const COR_REDE: Record<Rede, string> = { instagram: "#c13584", facebook: "#1877f2", tiktok: "#111111", youtube: "#cc0000" };
const SIGLA: Record<Rede, string> = { instagram: "IG", facebook: "FB", tiktok: "TT", youtube: "YT" };

export function RedeTag({ rede, comNome = false }: { rede: Rede; comNome?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1 text-xs" title={REDE_ROTULO[rede]}>
      <span aria-hidden className="inline-flex h-5 min-w-6 items-center justify-center rounded px-1 text-[10px] font-bold text-white" style={{ background: COR_REDE[rede] }}>{SIGLA[rede]}</span>
      {comNome ? <span>{REDE_ROTULO[rede]}</span> : <span className="sr-only">{REDE_ROTULO[rede]}</span>}
    </span>
  );
}
export const RedesTags = ({ redes }: { redes: Rede[] }) => <span className="inline-flex flex-wrap gap-1">{redes.map((r) => <RedeTag key={r} rede={r} />)}</span>;

const FORMATO_COR: Record<Formato, string> = { post: "#587458", carrossel: "#b07840", stories: "#7a4aa8", reels: "#c13584", video: "#3f6f8f", short: "#cc0000" };
export const FormatoTag = ({ formato }: { formato: Formato }) => (
  <span className="inline-flex items-center gap-1 text-xs text-tinta/80"><span aria-hidden className="h-2.5 w-2.5 rounded-sm" style={{ background: FORMATO_COR[formato] }} />{FORMATO_ROTULO[formato]}</span>
);
export const corDoFormato = (f: Formato) => FORMATO_COR[f];

export const PrioridadeTag = ({ p }: { p: Prioridade }) => <Badge tom={p === "alta" ? "vermelho" : p === "media" ? "amarelo" : "cinza"}>{PRIORIDADE_ROTULO[p]}</Badge>;
