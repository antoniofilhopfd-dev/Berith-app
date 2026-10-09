import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Nova Berith",
  description: "Aplicativo da Comunidade Católica Nova Berith",
  robots: { index: false, follow: false },
};
export const viewport: Viewport = { themeColor: "#6b1d2e", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className="min-h-dvh antialiased">{children}</body>
    </html>
  );
}
