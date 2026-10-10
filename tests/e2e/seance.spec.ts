import { test, expect, type Page } from "@playwright/test";
import {
  deleteSessionViaUi,
  E2E_ACCOUNT,
  guardWrites,
  login,
  logSet,
  openExitSheet,
  startSession,
} from "./helpers";

// Ces parcours créent de vraies séances : base de test uniquement.
guardWrites();

/** Lien « Reprendre » du bandeau de l'accueil, s'il vise cette séance. */
function resumeLinkTo(page: Page, sessionId: string) {
  return page
    .getByRole("link", { name: "Reprendre" })
    .and(page.locator(`[href="/sessions/${sessionId}"]`));
}

// Un seul profil pour tous les tests : on les enchaîne pour que le bandeau
// « Séance en cours » de l'un ne se mélange pas avec la séance d'un autre.
test.describe.configure({ mode: "serial" });

test.describe("Séance : démarrer, valider, sortir (CM-94)", () => {
  /** Séances créées par le test courant, supprimées quoi qu'il arrive. */
  let created: string[] = [];

  test.beforeEach(async ({ page }) => {
    created = [];
    await login(page, E2E_ACCOUNT.email, E2E_ACCOUNT.password);
  });

  test.afterEach(async ({ page }) => {
    for (const id of created) await deleteSessionViaUi(page, id);
  });

  test("démarrer une séance puis l'abandonner sans série", async ({ page }) => {
    const id = await startSession(page);
    created.push(id);
    await expect(page.getByRole("button", { name: /Valider la série/ })).toBeVisible();

    const sheet = await openExitSheet(page);
    await expect(sheet.getByRole("heading", { name: "Abandonner la séance ?" })).toBeVisible();
    // Une séance vide ne propose ni « Quitter sans terminer » ni « Terminer ».
    await expect(sheet.getByRole("button", { name: /Quitter sans terminer/ })).toHaveCount(0);
    await sheet.getByRole("button", { name: "Abandonner" }).click();

    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(resumeLinkTo(page, id)).toHaveCount(0);
  });

  test("valider une série puis supprimer la séance depuis la feuille", async ({ page }) => {
    const id = await startSession(page);
    created.push(id);

    await logSet(page, { weight: "20", reps: "8" });
    // La série validée devient « Série 1 », supprimable individuellement.
    await expect(page.getByRole("button", { name: "Supprimer la série 1" })).toBeVisible();

    // La croix ne sort jamais en un tap : « Continuer » referme la feuille.
    let sheet = await openExitSheet(page);
    await expect(sheet.getByRole("heading", { name: "Séance en cours" })).toBeVisible();
    await expect(sheet.getByText(/1 série enregistrée/)).toBeVisible();
    await sheet.getByRole("button", { name: "Continuer la séance" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);

    // Suppression : demande une confirmation en ligne, « Annuler » la retire.
    sheet = await openExitSheet(page);
    await sheet.getByRole("button", { name: "Supprimer la séance" }).click();
    await expect(sheet.getByText(/C'est définitif/)).toBeVisible();
    await sheet.getByRole("button", { name: "Supprimer", exact: true }).click();

    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(resumeLinkTo(page, id)).toHaveCount(0);
    // Plus rien à nettoyer : la séance n'existe plus.
    const res = await page.goto(`/sessions/${id}`);
    expect(res?.status()).toBe(404);
  });

  test("quitter sans terminer puis reprendre depuis l'accueil", async ({ page }) => {
    const id = await startSession(page);
    created.push(id);
    await logSet(page, { weight: "20", reps: "8" });

    const sheet = await openExitSheet(page);
    await sheet.getByRole("button", { name: /Quitter sans terminer/ }).click();
    await expect(page).toHaveURL(/\/dashboard$/);

    // Bandeau de reprise (CM-83) pointant sur la séance laissée en cours.
    const resume = page.getByRole("link", { name: "Reprendre" });
    await expect(resume).toHaveAttribute("href", `/sessions/${id}`);
    await resume.click();

    await expect(page).toHaveURL(new RegExp(`/sessions/${id}$`));
    // La série écrite au « Valider » (CM-78) est toujours là après la reprise.
    // Vérifiée via la feuille : la reprise rouvre sur l'exercice suivant si le
    // premier est déjà complet (cible à 1 série).
    const resumed = await openExitSheet(page);
    await expect(resumed.getByText(/1 série enregistrée/)).toBeVisible();
    await resumed.getByRole("button", { name: "Continuer la séance" }).click();
  });

  test("terminer la séance via la croix ouvre le récap", async ({ page }) => {
    const id = await startSession(page);
    created.push(id);
    await logSet(page, { weight: "20", reps: "8" });

    const sheet = await openExitSheet(page);
    await sheet.getByRole("button", { name: "Terminer la séance" }).click();

    // Récap (séance terminée) : mêmes URL, plus de logger.
    await expect(page.getByRole("link", { name: "Corriger les séries" })).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`/sessions/${id}$`));
    await expect(page.getByRole("button", { name: "Quitter la séance" })).toHaveCount(0);
    await expect(page.getByText("Volume total")).toBeVisible();
  });
});
