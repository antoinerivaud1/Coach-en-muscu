import { test, expect } from "@playwright/test";

test("l'accueil affiche le sélecteur de profil", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Qui s'entraîne/i })).toBeVisible();
});
