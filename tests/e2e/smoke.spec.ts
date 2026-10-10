import { test, expect } from "@playwright/test";

// Lecture seule, sans session (CM-59 B : plus de sélecteur de profil).

test("l'accueil sans session renvoie à la connexion", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole("heading", { name: /Connexion/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: /Qui s'entraîne/i })).toHaveCount(0);
});

test("une page privée sans session renvoie à la connexion", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByLabel("Email")).toBeVisible();
});
