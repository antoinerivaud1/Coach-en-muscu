import type { Metadata, Viewport } from "next";
import { Archivo, Oswald } from "next/font/google";
import "./globals.css";
import ServiceWorkerRegister from "@/components/ServiceWorkerRegister";
import OrientationLock from "@/components/OrientationLock";
import PendingSync from "@/components/PendingSync";

// Direction Sport — Archivo (titres / interface) + Oswald (chiffres / scores)
const archivo = Archivo({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800", "900"],
  variable: "--font-archivo",
  display: "swap",
});

const oswald = Oswald({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-oswald",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Coach en Muscu",
  description: "Tracker de séances pour Toi et Elle",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Muscu",
  },
  icons: {
    icon: "/icons/icon-192.png",
    apple: "/icons/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#0B0B0F",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fr" className={`${archivo.variable} ${oswald.variable}`}>
      <body className="min-h-screen bg-ink font-sans text-fg antialiased">
        {children}
        <PendingSync />
        <ServiceWorkerRegister />
        <OrientationLock />
      </body>
    </html>
  );
}
