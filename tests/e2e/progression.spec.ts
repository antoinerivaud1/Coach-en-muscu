import { test, expect } from "@playwright/test";
import {
  currentExerciseName,
  deleteSessionViaUi,
  E2E_ACCOUNT,
  guardWrites,
  login,
  logSet,
  openExitSheet,
  startSession,
} from "./helpers";

// Termine une vraie séance : base de test uniquement.
guardWrites();

test.describe("Progression", () => {
  let created: string[] = [];

  test.beforeEach(async ({ page }) => {
    created = [];
    await login(page, E2E_ACCOUNT.email, E2E_ACCOUNT.password);
  });

  test.afterEach(async ({ page }) => {
    for (const id of created) await deleteSessionViaUi(page, id);
  });

  test("une séance terminée apparaît dans la progression", async ({ page }) => {
    const id = await startSession(page);
    created.push(id);
    const exercise = await currentExerciseName(page);
    // Poids peu courant : la séance du test est la plus récente, sa valeur
    // est donc celle affichée en « Poids max ».
    await logSet(page, { weight: "37.5", reps: "7" });

    const sheet = await openExitSheet(page);
    await sheet.getByRole("button", { name: "Terminer la séance" }).click();
    await expect(page.getByRole("link", { name: "Corriger les séries" })).toBeVisible();

    // Accès par la barre de navigation, comme un utilisateur.
    await page.goto("/dashboard");
    await page.getByRole("link", { name: "Stats" }).click();
    await expect(page).toHaveURL(/\/progress/);
    await expect(page.getByRole("heading", { name: "Progression", level: 1 })).toBeVisible();

    await page.getByRole("button", { name: exercise, exact: true }).click();
    await expect(page.getByRole("heading", { name: exercise, level: 2 })).toBeVisible();
    await expect(page.getByRole("button", { name: "Poids max" })).toBeVisible();
    await expect(page.getByText("37.5", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Dernières séances")).toBeVisible();
  });

  // CM-88 : le Carnet est lu dans le navigateur et mis en cache. Fin et
  // suppression de séance restent des server actions (PR 6) : en revenant sur
  // le Carnet, il doit montrer l'état à jour. Tout par navigation client
  // (aucun `goto`), sinon le cache repartirait de zéro.
  test("Carnet déjà ouvert : une séance terminée puis supprimée y est à jour", async ({ page }) => {
    await page.getByRole("link", { name: "Carnet" }).click();
    await expect(page).toHaveURL(/\/history$/);
    await expect(page.getByRole("heading", { name: "Historique", level: 1 })).toBeVisible();
    await expect(page.getByText(/séances? enregistrées?/)).toBeVisible();

    await page.getByRole("link", { name: "Séances" }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
    const id = await startSession(page);
    created.push(id);
    await logSet(page, { weight: "20", reps: "8" });
    const sheet = await openExitSheet(page);
    await sheet.getByRole("button", { name: "Terminer la séance" }).click();
    await expect(page.getByRole("link", { name: "Corriger les séries" })).toBeVisible();

    await page.getByRole("link", { name: "← Historique" }).click();
    await expect(page).toHaveURL(/\/history$/);
    const row = page.locator(`a[href="/sessions/${id}"]`);
    await expect(row).toBeVisible();

    await row.click();
    await expect(page).toHaveURL(new RegExp(`/sessions/${id}$`));
    await page.getByRole("button", { name: "Supprimer", exact: true }).click();
    await expect(page).toHaveURL(/\/history$/);
    await expect(page.getByRole("heading", { name: "Historique", level: 1 })).toBeVisible();
    await expect(row).toHaveCount(0);
  });
});
