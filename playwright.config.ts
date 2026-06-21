import { defineConfig } from "@playwright/test";

/**
 * Tests e2e (CM-56). Lancer localement contre une app démarrée :
 *   E2E_BASE_URL=http://localhost:3000 npm run test:e2e
 * Nécessite une base Supabase de test (les parcours loggent de vraies données).
 * Non branché en CI tant qu'un projet Supabase de test dédié n'existe pas.
 */
export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: true,
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    trace: "on-first-retry",
  },
});
