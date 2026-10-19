import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  const atalho = (name: string, url: string, short_name: string) => ({ name, short_name, url, icons: [{ src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }] });
  return {
    id: "/",
    name: "Berith — Ministério de Comunicação",
    short_name: "Berith",
    description: "Gestão de redes sociais do Ministério de Comunicação da Comunidade Católica Nova Berith.",
    lang: "pt-BR",
    dir: "ltr",
    start_url: "/?origem=app",
    scope: "/",
    display: "standalone",
    display_override: ["standalone", "minimal-ui"],
    orientation: "any",
    background_color: "#3f523f",
    theme_color: "#3f523f",
    categories: ["productivity", "social", "business"],
    prefer_related_applications: false,
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      atalho("Produção", "/producao", "Produção"), atalho("Calendário", "/calendario", "Calendário"),
      atalho("Aprovações", "/aprovacoes", "Aprovações"), atalho("Relatórios", "/relatorios", "Relatórios"),
    ],
  };
}
