import type { Metadata, Viewport } from "next";
import "./globals.css";
import ServiceWorkerRegister from "@/components/ServiceWorkerRegister";
import OrientationLock from "@/components/OrientationLock";
import PendingSync from "@/components/PendingSync";
import QueryProvider from "@/components/providers/QueryProvider";
import OnboardingGate from "@/components/providers/OnboardingGate";
import ThemeController from "@/components/ThemeController";
import { THEME_BACKGROUND, THEME_BOOT_SCRIPT } from "@/lib/appearance";

export const metadata: Metadata = {
  title: "Coach en Muscu",
  description: "Suivi de séances de musculation, seul ou à deux",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    // CM-116 : « default » (et non « black-translucent ») : en PWA, la barre
    // d'état prend la couleur du thème et un texte lisible, en clair comme en
    // sombre.
    statusBarStyle: "default",
    title: "Muscu",
  },
  icons: {
    icon: "/icons/icon-192.png",
    apple: "/icons/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  // CM-116 : couleur de la barre du navigateur selon le thème du système ;
  // le script de thème la remplace par celle du thème choisi.
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: THEME_BACKGROUND.dark },
    { media: "(prefers-color-scheme: light)", color: THEME_BACKGROUND.light },
  ],
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
    // CM-116 : police système (SF Pro, chiffres en SF Pro Rounded) ; le thème
    // (clair / sombre) est posé avant le premier rendu par THEME_BOOT_SCRIPT.
    <html lang="fr" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
      </head>
      <body className="min-h-screen font-sans text-fg antialiased">
        <QueryProvider>
          {/* CM-89 (PR 1) : redirection vers l'onboarding, côté navigateur. */}
          <OnboardingGate>{children}</OnboardingGate>
          <PendingSync />
        </QueryProvider>
        <ThemeController />
        <ServiceWorkerRegister />
        <OrientationLock />
      </body>
    </html>
  );
}
