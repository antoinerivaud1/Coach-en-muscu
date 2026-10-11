import { test, expect } from "@playwright/test";

// Lecture seule, sans session (CM-59 B : plus de sélecteur de profil).

test("l'accueil sans session renvoie à la connexion", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole("heading", { name: /Connexion/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: /Qui s'entraîne/i })).toHaveCount(0);
});

test("une page privée sans session renvoie à la connexion, avec retour prévu", async ({ page }) => {
  await page.goto("/dashboard");
  // CM-59 B : requireProfileId(next) ramène à la page demandée après connexion.
  await expect(page).toHaveURL(/\/login\?next=%2Fdashboard$/);
  await expect(page.getByLabel("Email")).toBeVisible();
});

test("CM-88 : un écran client sans session renvoie à la connexion, avec retour prévu", async ({ page }) => {
  await page.goto("/guide");
  // Redirection faite dans le navigateur (useRequireProfileId), même URL qu'avant.
  await expect(page).toHaveURL(/\/login\?next=%2Fguide$/);
  await expect(page.getByLabel("Email")).toBeVisible();
});

test("CM-88 : le Carnet sans session renvoie à la connexion, avec retour prévu", async ({ page }) => {
  await page.goto("/history");
  await expect(page).toHaveURL(/\/login\?next=%2Fhistory$/);
  await expect(page.getByLabel("Email")).toBeVisible();
});

test("CM-88 : les Stats sans session renvoient à la connexion, avec retour prévu", async ({ page }) => {
  // Le `?profile=` n'est pas repris dans `next`, comme avant CM-88.
  await page.goto("/progress?profile=00000000-0000-0000-0000-000000000000");
  await expect(page).toHaveURL(/\/login\?next=%2Fprogress$/);
  await expect(page.getByLabel("Email")).toBeVisible();
});

test("CM-88 : le Profil sans session renvoie à la connexion, avec retour prévu", async ({ page }) => {
  await page.goto("/profile");
  await expect(page).toHaveURL(/\/login\?next=%2Fprofile$/);
  await expect(page.getByLabel("Email")).toBeVisible();
});
