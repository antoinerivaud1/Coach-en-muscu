import { defineConfig } from "@playwright/test";

/**
 * Deux familles de tests, un seul runner (aucune dépendance en plus) :
 *
 * - `unit` : tests purs de `lib/` (CM-67), sans navigateur ni réseau.
 *     npm run test:unit                      (CI : à chaque PR)
 *
 * - `e2e` (CM-56) : parcours réels contre une app démarrée.
 *     E2E_BASE_URL=http://localhost:3000 npm run test:e2e
 *   `smoke.spec.ts` est en lecture seule. Tous les autres fichiers écrivent de
 *   vraies données (séances, séries) et sont IGNORÉS sauf si
 *   `E2E_ALLOW_WRITES=1` ; ils échouent net si une URL Supabase de prod est
 *   présente dans l'environnement. Ne jamais les lancer contre la prod : il
 *   faut une base de test (voir tests/e2e/README.md). En CI (CM-98), le job
 *   e2e démarre une stack Supabase locale jetable (Docker) à chaque run.
 *   Exécution en série (un seul profil partagé) : `--workers=1` dans le
 *   script npm, `fullyParallel: false` sur le projet.
 *
 * - `native` (CM-89 (PR 3)) : smoke de l'export statique (`capacitor/www`)
 *   servi par scripts/serve-native.mjs, qui imite le routeur iOS de la PR 4.
 *     npm run build:native && npm run serve:native -- --port 4300 &
 *     E2E_NATIVE_BASE_URL=http://localhost:4300 npm run test:native
 *   Même base de test que `e2e` (connexion avec le compte du seed). Jamais
 *   lancé par `npm run test:e2e` (`--project=e2e`).
 */
export default defineConfig({
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  // En CI : rapport HTML (artefact du job e2e en cas d'échec) + sortie lisible.
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    trace: "on-first-retry",
  },
  projects: [
    { name: "unit", testDir: "tests/unit" },
    {
      name: "e2e",
      testDir: "tests/e2e",
      fullyParallel: false,
      retries: process.env.CI ? 1 : 0,
      // Viewport mobile : l'app est pensée pour le téléphone.
      use: { viewport: { width: 390, height: 844 }, hasTouch: true },
    },
    {
      name: "native",
      testDir: "tests/native",
      fullyParallel: false,
      retries: process.env.CI ? 1 : 0,
      use: {
        baseURL: process.env.E2E_NATIVE_BASE_URL ?? "http://localhost:4300",
        viewport: { width: 390, height: 844 },
        hasTouch: true,
        // Comme dans la coque : pas de service worker (Chromium n'est pas
        // « natif » pour Capacitor et l'enregistrerait).
        serviceWorkers: "block",
      },
    },
  ],
});
