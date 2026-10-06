import { test, expect } from "@playwright/test";
import { guardWrites, selectProfile } from "./helpers";

// Le tableau de bord purge les séances vides abandonnées (CM-83) : même la
// simple sélection de profil peut écrire. Garde-fou obligatoire.
guardWrites();

test.describe("Sélection de profil", () => {
  test("choisir un profil ouvre son tableau de bord", async ({ page }) => {
    await selectProfile(page);
    await expect(page.getByRole("link", { name: "Gérer mes séances" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Stats" })).toBeVisible();
  });

  test("« Changer de profil » ramène au sélecteur", async ({ page }) => {
    await selectProfile(page);
    await page.getByRole("button", { name: "Changer de profil" }).click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("heading", { name: /Qui s'entraîne/i })).toBeVisible();
  });
});
