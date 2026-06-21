import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Phase 5 (privé) : on embarque l'app Next.js hébergée sur Vercel dans une
 * coque native (server.url), pour garder server actions + Supabase service_role
 * côté serveur sans réécriture. Le bundle natif autonome viendra en Phase 6
 * (refactor data côté client sous RLS).
 */
const config: CapacitorConfig = {
  appId: "com.antoinerivaud.coachenmuscu",
  appName: "Coach en Muscu",
  webDir: "capacitor/www",
  server: {
    // App hébergée (prod). À mettre à jour si l'URL de prod change.
    url: "https://v0-gym-workout-tracker-silk.vercel.app",
    cleartext: false,
    allowNavigation: ["v0-gym-workout-tracker-silk.vercel.app"],
  },
  backgroundColor: "#0B0B0F",
  plugins: {
    SplashScreen: {
      backgroundColor: "#0B0B0F",
      showSpinner: false,
      launchAutoHide: true,
    },
    StatusBar: {
      style: "DARK",
      backgroundColor: "#0B0B0F",
    },
  },
};

export default config;
