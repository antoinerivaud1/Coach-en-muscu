import { expect, type Browser, type BrowserContext, type Page, type TestInfo } from "@playwright/test";
import { E2E_ACCOUNT, login, sessionPath } from "../e2e/helpers";

/**
 * CM-90 (PR 4) : outils des scénarios « réseau coupé ».
 *
 * Ce qu'on imite, c'est l'iPhone en mode avion (ou le réseau de salle
 * inutilisable) : le bundle de l'app reste local (ici, servi par
 * scripts/serve-native.mjs), seul Supabase est injoignable. `context.setOffline`
 * de Playwright ne convient pas : il couperait aussi le bundle, ce qui n'arrive
 * jamais dans la coque iOS.
 *
 * Deux interrupteurs indépendants :
 * - `blockBackend` : toute requête vers Supabase échoue comme sans réseau
 *   (`internetdisconnected`), pour toutes les pages du contexte, y compris
 *   celles ouvertes ensuite (« app relancée »).
 * - le mode avion : `navigator.onLine` vaut faux et l'événement `offline` est
 *   émis. Lu dans un cookie de test par un script injecté avant l'app, donc
 *   déjà vrai au premier rendu d'une page ouverte hors ligne.
 *
 * `goOffline` actionne les deux (mode avion), `blockBackend` seul imite le
 * réseau « présent mais inutilisable » (onLine reste vrai).
 */

/** Cookie de test lu par le script injecté. Jamais lu par l'app. */
const OFFLINE_COOKIE = "cm_e2e_offline";

const SUPABASE_ORIGIN = new URL(
  process.env.E2E_SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321",
).origin;

function isBackend(url: URL): boolean {
  return url.origin === SUPABASE_ORIGIN;
}

/**
 * À appeler une fois par contexte, AVANT la première page : `navigator.onLine`
 * suit le cookie de test, relu à chaque accès.
 */
export async function installNetworkSwitch(context: BrowserContext): Promise<void> {
  await context.addInitScript((cookie: string) => {
    Object.defineProperty(Navigator.prototype, "onLine", {
      configurable: true,
      get() {
        return !document.cookie.split("; ").includes(`${cookie}=1`);
      },
    });
  }, OFFLINE_COOKIE);
}

/** Supabase injoignable pour tout le contexte. */
export async function blockBackend(context: BrowserContext): Promise<void> {
  await context.route(isBackend, (route) => route.abort("internetdisconnected"));
}

async function dispatch(context: BrowserContext, event: "online" | "offline"): Promise<void> {
  for (const page of context.pages()) {
    if (page.isClosed()) continue;
    await page.evaluate((name) => window.dispatchEvent(new Event(name)), event).catch(() => {});
  }
}

/** Mode avion : Supabase injoignable ET `navigator.onLine` faux. */
export async function goOffline(context: BrowserContext, baseURL: string): Promise<void> {
  await blockBackend(context);
  await context.addCookies([{ name: OFFLINE_COOKIE, value: "1", url: baseURL }]);
  await dispatch(context, "offline");
}

/** Retour du réseau : Supabase joignable, `navigator.onLine` vrai, événement `online`. */
export async function goOnline(context: BrowserContext): Promise<void> {
  await context.unroute(isBackend);
  await context.clearCookies({ name: OFFLINE_COOKIE });
  await dispatch(context, "online");
}

/** Nom de la séance type des scénarios (données du seed). */
export const SEANCE_NAME = process.env.E2E_SEANCE_NAME ?? "Haut du corps";

/**
 * Attend que l'accueil connecté ait préparé le pack séance (CM-90 PR 2) de
 * cette séance type : sans lui, pas de démarrage hors ligne.
 */
export async function waitForPack(page: Page, dayName = SEANCE_NAME): Promise<void> {
  await expect
    .poll(
      () =>
        page.evaluate((name) => {
          const needle = `"dayName":${JSON.stringify(name)}`;
          return Object.keys(localStorage).some(
            (k) => k.startsWith("cm_offline_pack:") && (localStorage.getItem(k) ?? "").includes(needle),
          );
        }, dayName),
      { message: `pack séance « ${dayName} » préparé par l'accueil`, timeout: 15_000 },
    )
    .toBe(true);
}

/** Retire tous les packs séance du téléphone (séance « pas prête hors ligne »). */
export async function dropPacks(page: Page): Promise<void> {
  await page.evaluate(() => {
    for (const k of Object.keys(localStorage)) {
      if (k.startsWith("cm_offline_pack:")) localStorage.removeItem(k);
    }
  });
}

/** Indicateur global « N en attente de synchro » (PendingSync). */
export function pendingSyncBadge(page: Page) {
  return page.getByRole("status").filter({ hasText: /en attente de synchro/ });
}

/** Bandeau « Hors ligne · données du … » (OfflineBanner). */
export function offlineBanner(page: Page) {
  return page.getByRole("status").filter({ hasText: /^Hors ligne/ });
}

/**
 * Vérifie EN BASE, depuis un navigateur neuf (aucun cache, aucune file
 * locale), qu'une séance est terminée avec ces poids, puis la supprime par
 * l'UI. C'est la preuve que la resynchro a vraiment écrit sur le serveur.
 */
export async function expectFinishedInBaseThenDelete(
  browser: Browser,
  testInfo: TestInfo,
  sessionId: string,
  weights: readonly string[],
): Promise<void> {
  const { baseURL, viewport, hasTouch } = testInfo.project.use;
  const fresh = await browser.newContext({ baseURL, viewport, hasTouch, serviceWorkers: "block" });
  try {
    const page = await fresh.newPage();
    await login(page, E2E_ACCOUNT.email, E2E_ACCOUNT.password);
    await page.goto(sessionPath(sessionId));
    await expect(page.getByText("Volume total")).toBeVisible();
    await expect(page.getByRole("heading", { name: SEANCE_NAME, level: 1 })).toBeVisible();
    for (const w of weights) {
      await expect(page.getByText(w, { exact: true }).first()).toBeVisible();
    }
    await page.getByRole("button", { name: "Supprimer", exact: true }).click();
    await page.getByRole("button", { name: "Oui, supprimer" }).click();
    await expect(page).toHaveURL(/\/history$/);
  } finally {
    await fresh.close();
  }
}
