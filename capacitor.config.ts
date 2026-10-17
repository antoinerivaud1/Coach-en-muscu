import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Phase 7 / CM-89 : l'app native charge le bundle EMBARQUÉ (export statique
 * de Next, `npm run build:native` vers `capacitor/www`), servi par Capacitor
 * en `capacitor://localhost`. Plus de `server.url` ni d'`allowNavigation` :
 * l'app ne dépend plus de Vercel, seule Supabase est appelée (sous RLS).
 * Session dans Capacitor Preferences (lib/supabase/client.ts). Sur iOS, un
 * routeur dédié sert `<chemin>.html` pour chaque écran au rechargement
 * complet (ios/App/App/StaticExportRouter.swift).
 */
const config: CapacitorConfig = {
  appId: "com.antoinerivaud.coachenmuscu",
  appName: "Coach en Muscu",
  webDir: "capacitor/www",
  backgroundColor: "#111114",
  plugins: {
    SplashScreen: {
      backgroundColor: "#111114",
      showSpinner: false,
      launchAutoHide: true,
    },
    StatusBar: {
      style: "DARK",
      backgroundColor: "#111114",
    },
  },
};

export default config;
