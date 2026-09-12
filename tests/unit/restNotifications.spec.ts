import { test, expect } from "@playwright/test";
import { REST_NOTIF_ID, restDelayMs } from "@/lib/restNotifications";

// Tests unitaires purs (CM-74) : aucun navigateur, aucun service worker.
// Lancer : npm run test:unit

const NOW = 1_700_000_000_000;

test("délai : échéance dans le futur, on planifie sur ce qui reste", () => {
  expect(restDelayMs(NOW + 60_000, NOW)).toBe(60_000);
  // + 15 s sur un repos de 60 s lancé 5 s plus tôt : 70 s restantes.
  expect(restDelayMs(NOW + 75_000 - 5_000, NOW)).toBe(70_000);
  // - 15 s sur le même repos : 40 s restantes.
  expect(restDelayMs(NOW + 45_000 - 5_000, NOW)).toBe(40_000);
});

test("délai : échéance atteinte ou dépassée, rien à planifier", () => {
  expect(restDelayMs(NOW, NOW)).toBe(0);
  expect(restDelayMs(NOW - 10_000, NOW)).toBe(0);
});

test("délai : valeur non exploitable, rien à planifier", () => {
  expect(restDelayMs(Number.NaN, NOW)).toBe(0);
  expect(restDelayMs(Number.POSITIVE_INFINITY, NOW)).toBe(0);
});

test("id de notification constant : l'annulation vise toujours la même", () => {
  expect(REST_NOTIF_ID).toBe(1001);
});
