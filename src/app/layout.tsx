import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = { title: "Senso AI | Dados públicos, claros e verificáveis", description: "Consulte estatísticas públicas brasileiras em linguagem natural." };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="pt-BR"><body>{children}</body></html>; }
