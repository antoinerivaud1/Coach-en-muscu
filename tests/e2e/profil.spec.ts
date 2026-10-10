import { test, expect } from "@playwright/test";
import { E2E_ACCOUNT, guardWrites, login } from "./helpers";

// Le tableau de bord purge les séances vides abandonnées (CM-83) : même la
// simple connexion peut écrire. Garde-fou obligatoire.
guardWrites();

test.describe("Connexion et profil (CM-59 B)", () => {
  test("se connecter ouvre son tableau de bord", async ({ page }) => {
    await login(page, E2E_ACCOUNT.email, E2E_ACCOUNT.password);
    await expect(page.getByRole("link", { name: "Gérer mes séances" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Stats" })).toBeVisible();
  });

  test("« Se déconnecter » ramène à la connexion", async ({ page }) => {
    await login(page, E2E_ACCOUNT.email, E2E_ACCOUNT.password);
    await page.goto("/profile");
    await page.getByRole("button", { name: "Se déconnecter" }).click();
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole("heading", { name: /Connexion/ })).toBeVisible();
    // Session bien fermée : le tableau de bord renvoie à la connexion.
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login\?next=%2Fdashboard$/);
  });
});
