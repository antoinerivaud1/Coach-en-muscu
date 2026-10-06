import { test, expect } from "@playwright/test";

// Lecture seule. Ces tests supposent l'app en AUTH_MODE=cookie (défaut,
// variable absente) : c'est le mode de la CI et de la base de test.

test("l'accueil affiche le sélecteur de profil", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Qui s'entraîne/i })).toBeVisible();
});

test("CM-58 : en mode cookie, /login renvoie au sélecteur", async ({ page }) => {
  await page.goto("/login");
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("heading", { name: /Qui s'entraîne/i })).toBeVisible();
  await expect(page.getByRole("link", { name: /me connecter/i })).toHaveCount(0);
});
