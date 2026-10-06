import { test, expect } from "@playwright/test";
import {
  currentExerciseName,
  deleteSessionViaUi,
  guardWrites,
  logSet,
  openExitSheet,
  selectProfile,
  startSession,
} from "./helpers";

// Termine une vraie séance : base de test uniquement.
guardWrites();

test.describe("Progression", () => {
  let created: string[] = [];

  test.beforeEach(async ({ page }) => {
    created = [];
    await selectProfile(page);
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
});
