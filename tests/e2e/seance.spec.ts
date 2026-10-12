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
    await page.goto(`/sessions/${id}`);
    await expect(page.getByRole("heading", { name: "Séance introuvable" })).toBeVisible();
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
  test("corriger une série dans le récap, recharger, la valeur est gardée (CM-59 B)", async ({ page }) => {
    const id = await startSession(page);
    created.push(id);
    await logSet(page, { weight: "20", reps: "8" });

    const sheet = await openExitSheet(page);
    await sheet.getByRole("button", { name: "Terminer la séance" }).click();
    await page.getByRole("link", { name: "Corriger les séries" }).click();
    await expect(page).toHaveURL(new RegExp(`/sessions/${id}\\?editsets=1$`));

    // Correction par le formulaire du récap (écriture navigateur sous RLS,
    // CM-88 PR 6) : on attend la réponse de l'update avant de recharger.
    await page.locator('input[name="weight"]').first().fill("23.5");
    const saved = page.waitForResponse(
      (r) => r.request().method() === "PATCH" && r.url().includes("/rest/v1/session_sets"),
    );
    await page.getByRole("button", { name: "Enregistrer" }).first().click();
    await saved;

    await page.reload();
    await expect(page.locator('input[name="weight"]').first()).toHaveValue("23.5");
    await page.getByRole("link", { name: "Terminer", exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/sessions/${id}$`));
    await expect(page.getByText("23.5", { exact: true }).first()).toBeVisible();
  });

  // ---- CM-88 (PR 6) : écran de séance lu et écrit dans le navigateur ----

  test("le serveur ne renvoie aucune donnée de la séance", async ({ page }) => {
    const id = await startSession(page);
    created.push(id);
    await logSet(page, { weight: "20", reps: "8" });
    const sheet = await openExitSheet(page);
    await sheet.getByRole("button", { name: "Terminer la séance" }).click();
    await expect(page.getByText("Volume total")).toBeVisible();

    // Page statique : le HTML servi, même avec la session, ne contient ni le
    // récap ni le logger.
    const html = await (await page.request.get(`/sessions/${id}`)).text();
    expect(html).not.toContain("Volume total");
    expect(html).not.toContain("Corriger les séries");
  });

  test("« Modifier » rouvre la saisie d'une séance terminée, sans la rouvrir en base", async ({ page }) => {
    const id = await startSession(page);
    created.push(id);
    await logSet(page, { weight: "20", reps: "8" });
    const sheet = await openExitSheet(page);
    await sheet.getByRole("button", { name: "Terminer la séance" }).click();

    await page.getByRole("link", { name: "Modifier" }).click();
    await expect(page).toHaveURL(new RegExp(`/sessions/${id}\\?edit=1$`));
    await expect(page.getByRole("button", { name: "Quitter la séance" })).toBeVisible();
    // Séance terminée : la croix ramène à l'accueil sans feuille de sortie.
    await page.getByRole("button", { name: "Quitter la séance" }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.locator(`a[href="/sessions/${id}"]`).filter({ hasText: "Reprendre" })).toHaveCount(0);

    await page.goto(`/sessions/${id}`);
    await expect(page.getByText("Volume total")).toBeVisible();

    // « Modifier », retour au récap, puis « Modifier » encore, dans la même
    // page : la saisie se rouvre à chaque fois.
    for (let i = 0; i < 2; i += 1) {
      await page.getByRole("link", { name: "Modifier" }).click();
      await expect(page.getByRole("button", { name: "Quitter la séance" })).toBeVisible();
      await page.goBack();
      await expect(page.getByText("Volume total")).toBeVisible();
    }
  });

  test("dans le récap : supprimer une série, puis la séance (retour au Carnet)", async ({ page }) => {
    const id = await startSession(page);
    created.push(id);
    await logSet(page, { weight: "20", reps: "8" });
    const sheet = await openExitSheet(page);
    await sheet.getByRole("button", { name: "Terminer la séance" }).click();
    await expect(page.getByText("Volume total")).toBeVisible();

    await page.getByRole("link", { name: "Corriger les séries" }).click();
    const rows = page.locator('input[name="weight"]');
    await expect(rows.first()).toBeVisible();
    const before = await rows.count();
    expect(before).toBeGreaterThan(0);
    await page.getByRole("button", { name: "Supprimer", exact: true }).first().click();
    await expect(rows).toHaveCount(before - 1);

    await page.getByRole("link", { name: "Terminer", exact: true }).click();
    // Suppression de la séance : confirmation en ligne, « Annuler » la retire.
    await page.getByRole("button", { name: "Supprimer", exact: true }).click();
    await expect(page.getByText(/C'est définitif/)).toBeVisible();
    await page.getByRole("button", { name: "Annuler" }).click();
    await expect(page.getByText(/C'est définitif/)).toHaveCount(0);
    await expect(page).toHaveURL(new RegExp(`/sessions/${id}$`));
    await page.getByRole("button", { name: "Supprimer", exact: true }).click();
    await page.getByRole("button", { name: "Oui, supprimer" }).click();
    await expect(page).toHaveURL(/\/history$/);
    await expect(page.locator(`a[href="/sessions/${id}"]`)).toHaveCount(0);
  });

  test("en pleine séance, une relecture ratée ne démonte jamais la saisie", async ({ page }) => {
    const id = await startSession(page);
    created.push(id);
    await logSet(page, { weight: "20", reps: "8" });
    await expect(page.getByRole("button", { name: "Supprimer la série 1" })).toBeVisible();

    // La base « ne voit plus » la séance (jeton parti en anonyme, séance type
    // supprimée…), puis le réseau coupe et revient : relecture automatique.
    const pattern = "**/rest/v1/sessions?*";
    await page.route(pattern, (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: "[]" }),
    );
    try {
      const reread = page.waitForRequest((r) => r.url().includes("/rest/v1/sessions?"));
      await page.context().setOffline(true);
      await page.context().setOffline(false);
      // La relecture a bien eu lieu (sinon le test ne prouverait rien).
      await reread;
      await page.waitForTimeout(500);

      // Toujours la saisie, avec la série 1 validée : ni « Séance
      // introuvable », ni logger remonté sur une lecture d'avant la série.
      await expect(page.getByRole("heading", { name: "Séance introuvable" })).toHaveCount(0);
      await expect(page.getByRole("button", { name: "Supprimer la série 1" })).toBeVisible();
    } finally {
      await page.unroute(pattern);
    }
  });
});
