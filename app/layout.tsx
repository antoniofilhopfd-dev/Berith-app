import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Pwa } from "@/components/pwa";

export const metadata: Metadata = {
  title: "Nova Berith",
  description: "Gestão de redes sociais do Ministério de Comunicação da Comunidade Católica Nova Berith",
  robots: { index: false, follow: false },
  icons: { icon: [{ url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }], apple: "/icons/apple-touch-icon.png" },
  appleWebApp: { capable: true, title: "Berith", statusBarStyle: "black-translucent" },
  other: { "mobile-web-app-capable": "yes", "format-detection": "telephone=no" },
  applicationName: "Berith",
};
// viewport-fit=cover: o app ocupa a tela toda (inclusive atrás do notch e da barra do iPhone/iPad); as bordas usam as áreas seguras.
export const viewport: Viewport = { themeColor: "#3f523f", colorScheme: "light", width: "device-width", initialScale: 1, viewportFit: "cover" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className="min-h-dvh antialiased">{children}<Pwa /></body>
    </html>
  );
}
