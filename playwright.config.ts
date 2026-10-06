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
 *   faut une base de test (voir tests/e2e/README.md). En CI, le job e2e ne
 *   tourne que si le secret `E2E_SUPABASE_URL` est défini.
 *   Exécution en série (un seul profil partagé) : `--workers=1` dans le
 *   script npm, `fullyParallel: false` sur le projet.
 */
export default defineConfig({
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
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
  ],
});
