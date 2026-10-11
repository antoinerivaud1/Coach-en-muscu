import { test, expect } from "@playwright/test";
import { SEED_ACCOUNTS, SEED_NAMES, guardWrites, login } from "./helpers";

// CM-88 (PR 4) : l'accueil est lu depuis le NAVIGATEUR (client Supabase anon
// + session en cookie, sous RLS). Ne crée rien, mais l'accueil purge les
// séances vides abandonnées (CM-83) : garde-fou obligatoire. Données de
// supabase/seed.sql.

guardWrites();

test.describe("Accueil lu côté client (CM-88)", () => {
  test("le serveur ne renvoie aucune donnée, le navigateur affiche celles du compte", async ({ page }) => {
    await login(page, SEED_ACCOUNTS.toi.email, SEED_ACCOUNTS.toi.password);
    await expect(page.getByRole("heading", { name: `Salut, ${SEED_NAMES.toi}` })).toBeVisible();
    await expect(page.getByRole("button", { name: /Haut du corps/ }).first()).toBeVisible();
    // Séance type de Solo (hors duo) : jamais visible pour Théo (RLS).
    await expect(page.getByText("Full body")).toHaveCount(0);

    // Page statique : le HTML servi, même avec la session, ne contient rien
    // du compte (ni prénom, ni séance type).
    const html = await (await page.request.get("/dashboard")).text();
    expect(html).not.toContain("Haut du corps");
    expect(html).not.toContain(`Salut, ${SEED_NAMES.toi}`);
  });

  test("déconnexion puis autre compte par l'interface : rien de l'accueil précédent", async ({ page }) => {
    await login(page, SEED_ACCOUNTS.toi.email, SEED_ACCOUNTS.toi.password);
    await expect(page.getByRole("button", { name: /Haut du corps/ }).first()).toBeVisible();

    await page.getByRole("link", { name: "Profil" }).click();
    await page.getByRole("button", { name: "Se déconnecter" }).click();
    await expect(page).toHaveURL(/\/login$/);
    await page.getByLabel("Email").fill(SEED_ACCOUNTS.solo.email);
    await page.getByLabel("Mot de passe").fill(SEED_ACCOUNTS.solo.password);
    await page.getByRole("button", { name: "Se connecter" }).click();
    await expect(page).toHaveURL(/\/dashboard$/);

    await expect(page.getByRole("heading", { name: `Salut, ${SEED_NAMES.solo}` })).toBeVisible();
    await expect(page.getByText("Full body").first()).toBeVisible();
    await expect(page.getByText("Haut du corps")).toHaveCount(0);
    await expect(page.getByText(SEED_NAMES.toi)).toHaveCount(0);
  });

  test("un message d'erreur en query string s'affiche (CM-70)", async ({ page }) => {
    await login(page, SEED_ACCOUNTS.solo.email, SEED_ACCOUNTS.solo.password);
    await page.goto(`/dashboard?error=${encodeURIComponent("Séance introuvable")}`);
    await expect(
      page.getByRole("alert").filter({ hasText: "Séance introuvable" }),
    ).toBeVisible();
  });
});
