import { test, expect } from "@playwright/test";
import {
  deleteSessionViaUi,
  E2E_ACCOUNT,
  guardWrites,
  login,
  logSet,
  openExitSheet,
  sessionPath,
  sessionUrlExact,
  startSession,
} from "../e2e/helpers";
import { guardNativeRequests } from "./helpers";
import {
  blockBackend,
  dropPacks,
  expectFinishedInBaseThenDelete,
  goOffline,
  goOnline,
  installNetworkSwitch,
  offlineBanner,
  pendingSyncBadge,
  waitForPack,
} from "./offline";

// CM-90 (PR 4) : la salle sans réseau, sur l'export natif (bundle local,
// Supabase injoignable : voir ./offline.ts). Ces parcours créent de vraies
// séances, synchronisées au retour du réseau puis vérifiées et supprimées
// depuis un navigateur neuf : base de test uniquement.

guardWrites();
guardNativeRequests();

// Un seul compte pour tous les tests : pas de séances croisées.
test.describe.configure({ mode: "serial" });

/** Séance terminée de « Toi » (seed), visible dans le Carnet. */
const TOI_SESSION = "77777777-7777-7777-7777-000000000001";

/** La resynchro part sur l'événement `online` : quelques secondes suffisent. */
const SYNC_TIMEOUT = 20_000;

/** Séances créées par le test courant, nettoyées si le test n'a pas pu le faire. */
let created: string[] = [];

test.beforeEach(async ({ context, page }) => {
  created = [];
  await installNetworkSwitch(context);
  await login(page, E2E_ACCOUNT.email, E2E_ACCOUNT.password);
});

test.afterEach(async ({ context }) => {
  if (created.length === 0) return;
  await goOnline(context);
  const page = await context.newPage();
  for (const id of created) await deleteSessionViaUi(page, id);
});

test("mode avion : démarrer, saisir et terminer, tout arrive en base au retour du réseau", async ({
  context,
  page,
  baseURL,
  browser,
}, testInfo) => {
  await waitForPack(page);
  await goOffline(context, baseURL!);

  // Démarrage depuis le pack séance : id créé sur le téléphone.
  const id = await startSession(page);
  created.push(id);
  await logSet(page, { weight: "41", reps: "8" });
  await logSet(page, { weight: "43.5", reps: "6" });

  const sheet = await openExitSheet(page);
  await expect(sheet.getByText(/2 séries enregistrées/)).toBeVisible();
  await sheet.getByRole("button", { name: "Terminer la séance" }).click();
  await expect(page.getByText(/Séance enregistrée hors-ligne/)).toBeVisible();

  // Accueil relu depuis la copie locale, écritures en attente signalées.
  await page.getByRole("button", { name: "Retour à l'accueil" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole("heading", { name: /^Salut,/ })).toBeVisible();
  await expect(offlineBanner(page)).toBeVisible();
  await expect(pendingSyncBadge(page)).toBeVisible();
  // Séance terminée sur le téléphone : rien à reprendre.
  await expect(page.getByRole("link", { name: "Reprendre" })).toHaveCount(0);

  // Retour du réseau : démarrage, séries puis clôture rejoués, dans l'ordre.
  await goOnline(context);
  await expect(pendingSyncBadge(page)).toHaveCount(0, { timeout: SYNC_TIMEOUT });
  await expect(offlineBanner(page)).toHaveCount(0, { timeout: SYNC_TIMEOUT });

  await expectFinishedInBaseThenDelete(browser, testInfo, id, ["41", "43.5"]);
  created = [];
});

test("app fermée en pleine séance hors ligne, rouverte sans réseau : rien n'est perdu", async ({
  context,
  page,
  baseURL,
  browser,
}, testInfo) => {
  await waitForPack(page);
  await goOffline(context, baseURL!);

  const id = await startSession(page);
  created.push(id);
  await logSet(page, { weight: "51", reps: "8" });

  // « Tuer » l'app : la page disparaît, une nouvelle s'ouvre sur l'accueil
  // (comme l'iPhone au relancement), toujours sans réseau. Seul le stockage
  // du téléphone survit.
  await page.close();
  const relaunched = await context.newPage();
  await relaunched.goto("/dashboard");
  await expect(relaunched.getByRole("heading", { name: /^Salut,/ })).toBeVisible();
  await expect(offlineBanner(relaunched)).toBeVisible();

  // « Reprendre » vient de la séance gardée sur le téléphone : le serveur ne
  // la connaît pas encore.
  const resume = relaunched.getByRole("link", { name: "Reprendre" });
  await expect(resume).toHaveAttribute("href", sessionPath(id));
  await expect(relaunched.getByText(/Séance en cours/)).toBeVisible();
  await expect(relaunched.getByText(" · 1 série", { exact: true })).toBeVisible();
  await resume.click();
  await expect(relaunched).toHaveURL(sessionUrlExact(id));

  // La séance rouvre sur le logger, avec la série déjà validée.
  let sheet = await openExitSheet(relaunched);
  await expect(sheet.getByText(/1 série enregistrée/)).toBeVisible();
  await sheet.getByRole("button", { name: "Continuer la séance" }).click();

  await logSet(relaunched, { weight: "53.5", reps: "6" });
  sheet = await openExitSheet(relaunched);
  await expect(sheet.getByText(/2 séries enregistrées/)).toBeVisible();
  await sheet.getByRole("button", { name: "Terminer la séance" }).click();
  await expect(relaunched.getByText(/Séance enregistrée hors-ligne/)).toBeVisible();

  await goOnline(context);
  await relaunched.getByRole("button", { name: "Retour à l'accueil" }).click();
  await expect(pendingSyncBadge(relaunched)).toHaveCount(0, { timeout: SYNC_TIMEOUT });

  await expectFinishedInBaseThenDelete(browser, testInfo, id, ["51", "53.5"]);
  created = [];
});

test("réseau de salle inutilisable (téléphone « en ligne ») : la séance démarre quand même", async ({
  context,
  page,
  browser,
}, testInfo) => {
  // `navigator.onLine` reste vrai : le démarrage est tenté en ligne, échoue
  // (ou reste sans réponse 8 s au plus), puis bascule hors ligne, même id.
  test.slow();
  await waitForPack(page);
  await blockBackend(context);

  const id = await startSession(page);
  created.push(id);
  await logSet(page, { weight: "61", reps: "8" });

  const sheet = await openExitSheet(page);
  await sheet.getByRole("button", { name: "Terminer la séance" }).click();
  await expect(page.getByText(/Séance enregistrée hors-ligne/)).toBeVisible();

  await goOnline(context);
  await page.getByRole("button", { name: "Retour à l'accueil" }).click();
  await expect(pendingSyncBadge(page)).toHaveCount(0, { timeout: SYNC_TIMEOUT });

  await expectFinishedInBaseThenDelete(browser, testInfo, id, ["61"]);
  created = [];
});

test("mode avion sans pack séance : message clair, aucune séance créée", async ({ context, page, baseURL }) => {
  await waitForPack(page);
  await goOffline(context, baseURL!);
  await dropPacks(page);

  await page
    .getByRole("button")
    .filter({ hasText: /\d+ exercices?/ })
    .first()
    .click();
  await expect(page).toHaveURL(/\/dashboard\?error=/);
  await expect(page.getByText(/pas encore prête hors ligne/)).toBeVisible();
  await expect(pendingSyncBadge(page)).toHaveCount(0);
});

test("lecture hors ligne : écrans déjà vus avec bandeau, actions en ligne désactivées", async ({
  context,
  page,
  baseURL,
}) => {
  // En ligne : on passe par les écrans (liens de l'app, sans recharger) pour
  // remplir la copie locale.
  await page.getByRole("link", { name: "Gérer mes séances" }).click();
  await expect(page.getByRole("button", { name: "Dupliquer" }).first()).toBeEnabled();
  await page.goBack();
  await expect(page.getByRole("heading", { name: /^Salut,/ })).toBeVisible();
  await page.getByRole("link", { name: "Progrès", exact: true }).click();
  await page.getByRole("link", { name: "Historique", exact: true }).click();
  await expect(page.locator(`a[href="${sessionPath(TOI_SESSION)}"]`)).toBeVisible();
  await page.getByRole("link", { name: "Profil" }).click();
  await expect(page.getByRole("button", { name: /Exporter/ }).first()).toBeEnabled();
  // La copie IndexedDB est écrite par lots (~1 s).
  await page.waitForTimeout(1500);

  // App relancée en mode avion.
  await page.close();
  await goOffline(context, baseURL!);
  const offline = await context.newPage();

  await offline.goto("/dashboard");
  await expect(offline.getByRole("heading", { name: /^Salut,/ })).toBeVisible();
  await expect(offlineBanner(offline)).toContainText(/Hors ligne · données du \d{2}\/\d{2} à \d{2}:\d{2}/);

  await offline.goto("/history");
  await expect(offline.locator(`a[href="${sessionPath(TOI_SESSION)}"]`)).toBeVisible();
  await expect(offlineBanner(offline)).toBeVisible();

  // Séances types : seul « Démarrer » reste possible.
  await offline.goto("/seances");
  await expect(offline.getByRole("button", { name: "Dupliquer" }).first()).toBeDisabled();
  await expect(offline.getByText("Modifier", { exact: true }).first()).toHaveAttribute("aria-disabled", "true");
  await expect(offline.getByText("Disponible avec du réseau.").first()).toBeVisible();

  // Profil : export, suppression du compte et duo désactivés, bandeau en tête.
  await offline.goto("/profile");
  await expect(offlineBanner(offline)).toBeVisible();
  await expect(offline.getByRole("button", { name: /Exporter/ }).first()).toBeDisabled();
  await expect(offline.getByRole("button", { name: /Supprimer mon compte/ })).toBeDisabled();
  await expect(offline.getByRole("button", { name: "Quitter le duo" })).toBeDisabled();

  // Retour du réseau : les écrans se relisent, le bandeau disparaît.
  await goOnline(context);
  await expect(offlineBanner(offline)).toHaveCount(0, { timeout: SYNC_TIMEOUT });
  await expect(offline.getByRole("button", { name: /Exporter/ }).first()).toBeEnabled();
});

test("mode avion, écran jamais ouvert sur ce téléphone : message explicite, pas de chargement sans fin", async ({
  context,
  page,
  baseURL,
}) => {
  await page.close();
  await goOffline(context, baseURL!);
  const offline = await context.newPage();
  await offline.goto("/progress");
  await expect(
    offline.getByRole("alert").filter({ hasText: /n'a pas encore été ouvert sur ce téléphone/ }),
  ).toBeVisible();
  await expect(offline.getByRole("button", { name: "Réessayer" })).toBeVisible();
});
