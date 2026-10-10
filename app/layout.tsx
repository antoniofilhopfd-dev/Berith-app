import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Pwa } from "@/components/pwa";

export const metadata: Metadata = {
  title: "Nova Berith",
  description: "Aplicativo da Comunidade Católica Nova Berith",
  robots: { index: false, follow: false },
  icons: { icon: [{ url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }], apple: "/icons/apple-touch-icon.png" },
  appleWebApp: { capable: true, title: "Nova Berith", statusBarStyle: "default" },
};
export const viewport: Viewport = { themeColor: "#587458", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className="min-h-dvh antialiased">{children}<Pwa /></body>
    </html>
  );
}
