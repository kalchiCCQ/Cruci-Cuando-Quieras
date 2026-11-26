import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Cruci cuando quieras",
  description: "Crea y juega crucigramas a partir de tus propias pistas.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
