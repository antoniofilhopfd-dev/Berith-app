/** Datas relevantes para o planejamento editorial (calculadas; sugestões editáveis — confirme no calendário oficial). */
import { addDays } from "@/lib/time";

export type DataEspecial = { dia: string; nome: string; origem: "fixa" | "movel" | "ministerio" };

/** Páscoa (algoritmo de Meeus/Jones/Butcher). */
export function pascoa(ano: number): string {
  const a = ano % 19, b = Math.floor(ano / 100), c = ano % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31), dia = ((h + l - 7 * m + 114) % 31) + 1;
  return `${ano}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
}

const dow = (data: string) => new Date(data + "T12:00:00Z").getUTCDay();
/** n-ésimo domingo do mês (1 = primeiro). */
function nesimoDomingo(ano: number, mes: number, n: number): string {
  const primeiro = `${ano}-${String(mes).padStart(2, "0")}-01`;
  return addDays(primeiro, (7 - dow(primeiro)) % 7 + (n - 1) * 7);
}

export function datasDoAno(ano: number): DataEspecial[] {
  const f = (md: string, nome: string): DataEspecial => ({ dia: `${ano}-${md}`, nome, origem: "fixa" });
  const p = pascoa(ano);
  const mv = (delta: number, nome: string): DataEspecial => ({ dia: addDays(p, delta), nome, origem: "movel" });
  const natal = `${ano}-12-25`;
  // 1º domingo do Advento: 4º domingo anterior ao Natal (o domingo mais próximo de 30/11).
  const advento = addDays(natal, -((dow(natal) === 0 ? 7 : dow(natal)) + 21));
  return [
    f("01-01", "Santa Maria, Mãe de Deus"), f("01-06", "Epifania do Senhor"), f("02-02", "Apresentação do Senhor"),
    f("03-19", "São José"), f("03-25", "Anunciação do Senhor"), f("05-01", "São José Operário"),
    f("06-24", "Natividade de São João Batista"), f("06-29", "São Pedro e São Paulo"), f("08-04", "Dia do Padre (São João Maria Vianney)"),
    f("08-15", "Assunção de Nossa Senhora"), f("10-12", "Nossa Senhora Aparecida"), f("11-01", "Todos os Santos"),
    f("11-02", "Finados"), f("12-08", "Imaculada Conceição"), f("12-25", "Natal do Senhor"),
    { dia: nesimoDomingo(ano, 5, 2), nome: "Dia das Mães", origem: "movel" },
    { dia: nesimoDomingo(ano, 8, 2), nome: "Dia dos Pais", origem: "movel" },
    mv(-46, "Quarta-feira de Cinzas"), mv(-7, "Domingo de Ramos"), mv(-3, "Quinta-feira Santa"), mv(-2, "Sexta-feira da Paixão"),
    mv(0, "Páscoa do Senhor"), mv(49, "Pentecostes"), mv(56, "Santíssima Trindade"), mv(60, "Corpus Christi"),
    { dia: advento, nome: "1º Domingo do Advento", origem: "movel" },
    { dia: addDays(advento, -7), nome: "Cristo Rei do Universo", origem: "movel" },
  ];
}

/** Datas no intervalo [de, ate] (AAAA-MM-DD), incluindo as cadastradas pelo ministério. */
export function datasNoPeriodo(de: string, ate: string, proprias: { dia: string; nome: string; anual: boolean }[] = []): DataEspecial[] {
  const a1 = Number(de.slice(0, 4)), a2 = Number(ate.slice(0, 4));
  const out: DataEspecial[] = [];
  for (let ano = a1; ano <= a2; ano++) out.push(...datasDoAno(ano));
  for (const d of proprias) {
    for (let ano = a1; ano <= a2; ano++) {
      const dia = d.anual ? `${ano}${d.dia.slice(4)}` : d.dia;
      if (!d.anual && ano !== a1) continue;
      out.push({ dia, nome: d.nome, origem: "ministerio" });
    }
  }
  return out.filter((x) => x.dia >= de && x.dia <= ate).sort((x, y) => x.dia.localeCompare(y.dia) || x.nome.localeCompare(y.nome));
}
