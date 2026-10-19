/** Gráficos simples (SVG/CSS, sem biblioteca), no estilo do Instagram. Renderizam no servidor. */
export const GRADIENTE_IG = "linear-gradient(90deg, #c13584, #f77737)";

export function BarrasH({ itens, formato }: { itens: { rotulo: string; valor: number; extra?: string }[]; formato: (n: number) => string }) {
  const max = Math.max(1, ...itens.map((i) => i.valor));
  return (
    <ul className="space-y-3">
      {itens.map((i) => (
        <li key={i.rotulo} className="grid grid-cols-[7.5rem_1fr_auto] items-center gap-3 text-sm">
          <span className="truncate">{i.rotulo}</span>
          <span className="h-2.5 overflow-hidden rounded-full bg-borda/50" role="img" aria-label={`${i.rotulo}: ${formato(i.valor)}`}>
            <span className="block h-full rounded-full" style={{ width: `${Math.max(i.valor > 0 ? 2 : 0, (i.valor / max) * 100)}%`, background: GRADIENTE_IG }} />
          </span>
          <strong className="text-right tabular-nums">{formato(i.valor)}{i.extra ? <span className="ml-1 font-normal text-tinta/60">{i.extra}</span> : null}</strong>
        </li>
      ))}
    </ul>
  );
}

/** Linha da evolução (ex.: seguidores por dia). Eixo Y com valores reais — sem arredondar rótulos repetidos. */
export function LinhaEvolucao({ pontos, rotuloX, formato }: { pontos: { x: string; y: number }[]; rotuloX: (x: string) => string; formato: (n: number) => string }) {
  if (pontos.length < 2) return <p className="text-sm text-tinta/60">Ainda não há pontos suficientes: o histórico de seguidores começa quando o Berith passa a coletar (a Meta não entrega o passado).</p>;
  const W = 640, H = 200, ml = 56, mr = 12, mt = 12, mb = 26;
  const ys = pontos.map((p) => p.y), min = Math.min(...ys), max = Math.max(...ys), faixa = Math.max(1, max - min);
  const X = (i: number) => ml + (i / (pontos.length - 1)) * (W - ml - mr);
  const Y = (v: number) => mt + (1 - (v - min) / faixa) * (H - mt - mb);
  const d = pontos.map((p, i) => `${i ? "L" : "M"}${X(i).toFixed(1)},${Y(p.y).toFixed(1)}`).join(" ");
  const area = `${d} L${X(pontos.length - 1).toFixed(1)},${H - mb} L${X(0).toFixed(1)},${H - mb} Z`;
  const eixo = [min, min + faixa / 2, max];
  const passo = Math.ceil(pontos.length / 6);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={`Evolução de ${formato(pontos[0].y)} para ${formato(pontos[pontos.length - 1].y)}`}>
      {eixo.map((v) => <g key={v}><line x1={ml} x2={W - mr} y1={Y(v)} y2={Y(v)} stroke="currentColor" opacity={0.12} /><text x={ml - 6} y={Y(v) + 4} textAnchor="end" fontSize="11" fill="currentColor" opacity={0.7}>{formato(Math.round(v))}</text></g>)}
      <path d={area} fill="#c13584" opacity={0.08} />
      <path d={d} fill="none" stroke="#c13584" strokeWidth={2.5} strokeLinejoin="round" />
      {pontos.map((p, i) => (i % passo === 0 || i === pontos.length - 1) ? <text key={p.x} x={X(i)} y={H - 8} textAnchor="middle" fontSize="11" fill="currentColor" opacity={0.7}>{rotuloX(p.x)}</text> : null)}
      <circle cx={X(pontos.length - 1)} cy={Y(pontos[pontos.length - 1].y)} r={3.5} fill="#c13584" />
    </svg>
  );
}
