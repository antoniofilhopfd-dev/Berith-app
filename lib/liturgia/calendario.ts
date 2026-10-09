/**
 * Calendário litúrgico (rito romano) calculado — fatos, sem texto protegido.
 * Não inclui solenidades, festas e memórias de santos (variam por calendário local): a cor e o
 * título do dia mostram o TEMPO litúrgico; a celebração do dia vem do cadastro com fonte.
 */
import { addDays } from "@/lib/time";

const dow = (d: string) => new Date(d + "T12:00:00Z").getUTCDay();
const diff = (a: string, b: string) => Math.round((Date.parse(a + "T12:00:00Z") - Date.parse(b + "T12:00:00Z")) / 86400_000);
const pad = (n: number) => String(n).padStart(2, "0");
const iso = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;

/** Algoritmo de Meeus/Jones/Butcher (calendário gregoriano). */
export function pascoa(ano: number): string {
  const a = ano % 19, b = Math.floor(ano / 100), c = ano % 100, d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31), dia = ((h + l - 7 * m + 114) % 31) + 1;
  return iso(ano, mes, dia);
}

/** Primeiro domingo do Advento: o domingo mais próximo de 30/11 (4 domingos antes do Natal). */
export function advento(ano: number): string {
  const natal = iso(ano, 12, 25);
  const diaSemana = dow(natal);
  return addDays(natal, -(diaSemana === 0 ? 28 : 21 + diaSemana));
}

/** Batismo do Senhor. No Brasil a Epifania é no domingo entre 2 e 8/1; o Batismo é o domingo seguinte (ou a segunda, se a Epifania cair em 7 ou 8). */
export function batismoDoSenhor(ano: number): string {
  let epifania = iso(ano, 1, 2);
  while (dow(epifania) !== 0) epifania = addDays(epifania, 1);
  const dia = Number(epifania.slice(8));
  return dia >= 7 ? addDays(epifania, 1) : addDays(epifania, 7);
}

export type TempoLiturgico = "advento" | "natal" | "comum" | "quaresma" | "triduo" | "pascal";
export type Cor = "verde" | "roxo" | "branco" | "vermelho";
export type DiaLiturgico = {
  data: string; tempo: TempoLiturgico; tempoNome: string; semana: number | null; titulo: string; cor: Cor;
  cicloDominical: "A" | "B" | "C"; cicloFerial: "I" | "II"; domingo: boolean;
};

const DIAS = ["Domingo", "Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado"];
const ord = (n: number) => `${n}ª`;
const ordM = (n: number) => `${n}º`;

/** Ano litúrgico = ano civil em que o Advento começou. */
function anoLiturgico(data: string): number {
  const y = Number(data.slice(0, 4));
  return data >= advento(y) ? y : y - 1;
}
export function ciclos(data: string): { dominical: "A" | "B" | "C"; ferial: "I" | "II" } {
  const y = anoLiturgico(data);
  return { dominical: (["A", "B", "C"] as const)[y % 3], ferial: (y + 1) % 2 === 1 ? "I" : "II" };
}

export function diaLiturgico(data: string): DiaLiturgico {
  const y = Number(data.slice(0, 4));
  const d = dow(data), domingo = d === 0;
  const { dominical, ferial } = ciclos(data);
  const base = { data, cicloDominical: dominical, cicloFerial: ferial, domingo };
  const easter = pascoa(y), cinzas = addDays(easter, -46), ramos = addDays(easter, -7), pentecostes = addDays(easter, 49);
  const adv = advento(y), natal = iso(y, 12, 25), batismo = batismoDoSenhor(y);
  const nomeDia = DIAS[d];

  // Advento
  if (data >= adv && data < natal) {
    const semana = Math.floor(diff(data, adv) / 7) + 1;
    return { ...base, tempo: "advento", tempoNome: "Advento", semana, cor: "roxo", titulo: domingo ? `${ordM(semana)} Domingo do Advento` : `${nomeDia} da ${ord(semana)} semana do Advento` };
  }
  // Natal (25/12 até o Batismo do Senhor, que pode estar no ano seguinte)
  if (data >= natal) return { ...base, tempo: "natal", tempoNome: "Tempo do Natal", semana: null, cor: "branco", titulo: data === natal ? "Natal do Senhor" : `${nomeDia} no Tempo do Natal` };
  if (data <= batismo) {
    return { ...base, tempo: "natal", tempoNome: "Tempo do Natal", semana: null, cor: "branco", titulo: data === batismo ? "Batismo do Senhor" : `${nomeDia} no Tempo do Natal` };
  }
  // Quaresma e Tríduo
  if (data >= cinzas && data < addDays(easter, -3)) {
    const primeiroDomingo = addDays(cinzas, 4);
    if (data < primeiroDomingo) return { ...base, tempo: "quaresma", tempoNome: "Quaresma", semana: null, cor: "roxo", titulo: data === cinzas ? "Quarta-feira de Cinzas" : `${nomeDia} após as Cinzas` };
    if (data >= ramos) return { ...base, tempo: "quaresma", tempoNome: "Semana Santa", semana: null, cor: domingo ? "vermelho" : "roxo", titulo: domingo ? "Domingo de Ramos na Paixão do Senhor" : `${nomeDia} da Semana Santa` };
    const semana = Math.floor(diff(data, primeiroDomingo) / 7) + 1;
    return { ...base, tempo: "quaresma", tempoNome: "Quaresma", semana, cor: "roxo", titulo: domingo ? `${ordM(semana)} Domingo da Quaresma` : `${nomeDia} da ${ord(semana)} semana da Quaresma` };
  }
  if (data >= addDays(easter, -3) && data < easter) {
    const nome = ["Quinta-feira Santa", "Sexta-feira da Paixão do Senhor", "Sábado Santo"][diff(data, addDays(easter, -3))];
    return { ...base, tempo: "triduo", tempoNome: "Tríduo Pascal", semana: null, cor: data === addDays(easter, -2) ? "vermelho" : data === addDays(easter, -3) ? "branco" : "branco", titulo: nome };
  }
  // Páscoa até Pentecostes
  if (data >= easter && data <= pentecostes) {
    const semana = Math.floor(diff(data, easter) / 7) + 1;
    if (data === easter) return { ...base, tempo: "pascal", tempoNome: "Tempo Pascal", semana: 1, cor: "branco", titulo: "Domingo de Páscoa na Ressurreição do Senhor" };
    if (data === pentecostes) return { ...base, tempo: "pascal", tempoNome: "Tempo Pascal", semana: 8, cor: "vermelho", titulo: "Domingo de Pentecostes" };
    return { ...base, tempo: "pascal", tempoNome: "Tempo Pascal", semana, cor: "branco", titulo: domingo ? `${ordM(semana)} Domingo da Páscoa` : `${nomeDia} da ${ord(semana)} semana da Páscoa` };
  }
  // Tempo Comum: antes da Quaresma (depois do Batismo) e depois de Pentecostes
  const antes = data < cinzas;
  const semana = antes ? Math.floor(diff(data, batismo) / 7) + 1 : 35 - Math.ceil(diff(adv, data) / 7);
  const titulo = domingo ? `${ordM(semana)} Domingo do Tempo Comum` : `${nomeDia} da ${ord(semana)} semana do Tempo Comum`;
  return { ...base, tempo: "comum", tempoNome: "Tempo Comum", semana, cor: "verde", titulo: semana === 34 && domingo ? "Nosso Senhor Jesus Cristo, Rei do Universo (34º Domingo do Tempo Comum)" : titulo };
}
