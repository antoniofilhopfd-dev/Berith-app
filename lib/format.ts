const dtf = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric" });
export const formatDate = (d: Date | string | null) => (d ? dtf.format(typeof d === "string" ? new Date(d) : d) : "—");
export const TIPO_LABEL: Record<string, string> = {
  comunidade: "Comunidade", caminho: "Caminho", ministerio: "Ministério", grupo: "Grupo", equipe: "Pastoral/Equipe", servico: "Serviço",
};
export const PAPEL_LABEL: Record<string, string> = {
  admin_geral: "Administrador geral", coord_caminho: "Coordenação de caminho", coord_ministerio: "Coordenação de ministério",
  coord_grupo: "Coordenação de grupo", resp_servico: "Responsável por serviço", resp_financeiro: "Responsável financeiro",
  resp_comunicacao: "Responsável por comunicação",
};
