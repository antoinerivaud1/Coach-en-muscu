import { defineConfig } from "@playwright/test";

/**
 * Deux familles de tests, un seul runner (aucune dépendance en plus) :
 *
 * - `unit` : tests purs de `lib/` (CM-67), sans navigateur ni réseau.
 *     npm run test:unit
 * - `e2e` (CM-56) : parcours réels, à lancer contre une app démarrée.
 *     E2E_BASE_URL=http://localhost:3000 npm run test:e2e
 *   Nécessite une base Supabase de test (les parcours loggent de vraies
 *   données). Non branché en CI tant qu'un projet Supabase de test dédié
 *   n'existe pas.
 */
export default defineConfig({
  fullyParallel: true,
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    trace: "on-first-retry",
  },
  projects: [
    { name: "unit", testDir: "tests/unit" },
    { name: "e2e", testDir: "tests/e2e" },
  ],
});
