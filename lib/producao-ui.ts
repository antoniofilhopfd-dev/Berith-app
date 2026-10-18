import type { Pub, PubMidia, PubRede } from "@/lib/services/publicacoes";
import type { Inicial } from "@/components/editor-publicacao";
import { utcToLocal } from "@/lib/time";

const dt = (d: Date | null) => (d ? utcToLocal(new Date(d)) : null);

/** Converte os dados do banco no estado inicial do editor (datas no fuso do ministério). */
export function paraInicial(pub: Pub, redes: PubRede[], midias: PubMidia[]): Inicial {
  const prazo = dt(pub.prazo), publicar = dt(pub.publicar_em);
  return {
    id: pub.id, rev: pub.rev, status: pub.status,
    titulo: pub.titulo, descricao: pub.descricao ?? "", objetivo: pub.objetivo ?? "", formato: pub.formato, redes: redes.map((r) => r.rede),
    campanhaId: pub.campanha_id, editoriaId: pub.editoria_id, responsavelId: pub.responsavel_id, prioridade: pub.prioridade,
    legenda: pub.legenda ?? "", hashtags: pub.hashtags ?? "", referencias: pub.referencias ?? "", observacoes: pub.observacoes ?? "",
    porRede: Object.fromEntries(redes.map((r) => [r.rede, { legenda: r.legenda ?? "", hashtags: r.hashtags ?? "", titulo: r.titulo_externo ?? "" }])),
    prazoData: prazo?.date ?? "", prazoHora: prazo?.time ?? "", publicarData: publicar?.date ?? "", publicarHora: publicar?.time ?? "",
    midias: midias.map((m) => ({ id: m.id, tipo: m.tipo, nome: m.nome_original, largura: m.largura, altura: m.altura })),
  };
}

export const inicialVazio = (o: Partial<Inicial> = {}): Inicial => ({
  id: null, rev: 0, status: "rascunho", titulo: "", descricao: "", objetivo: "", formato: "post", redes: ["instagram"], campanhaId: null, editoriaId: null,
  responsavelId: null, prioridade: "media", legenda: "", hashtags: "", referencias: "", observacoes: "", porRede: {},
  prazoData: "", prazoHora: "", publicarData: "", publicarHora: "", midias: [], ...o,
});
