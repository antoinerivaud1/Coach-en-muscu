import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Coach en Muscu",
  description: "Tracker de séances pour Toi et Elle"
};

export default function RootLayout({
  children
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fr">
      <body className="min-h-screen bg-zinc-950 text-zinc-50 antialiased">
        {children}
      </body>
    </html>
  );
}
