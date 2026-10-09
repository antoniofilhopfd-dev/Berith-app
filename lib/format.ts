const dtf = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric" });
export const formatDate = (d: Date | string | null) => {
  if (!d) return "—";
  if (typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d)) return d.split("-").reverse().join("/"); // DATE puro: sem fuso
  return dtf.format(typeof d === "string" ? new Date(d) : d);
};
const tf = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
export const formatTime = (d: Date) => tf.format(d);
export const TIPO_LABEL: Record<string, string> = {
  comunidade: "Comunidade", caminho: "Caminho", ministerio: "Ministério", grupo: "Grupo", equipe: "Pastoral/Equipe", servico: "Serviço",
};
export const PAPEL_LABEL: Record<string, string> = {
  admin_geral: "Administrador geral", coord_caminho: "Coordenação de caminho", coord_ministerio: "Coordenação de ministério",
  coord_grupo: "Coordenação de grupo", resp_servico: "Responsável por serviço", resp_financeiro: "Responsável financeiro",
  resp_comunicacao: "Responsável por comunicação",
};

export const STATUS_LABEL: Record<string, string> = { aberta: "Aberta", em_andamento: "Em andamento", concluida: "Concluída", cancelada: "Cancelada" };

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1).replace(".", ",")} MB`;
}
