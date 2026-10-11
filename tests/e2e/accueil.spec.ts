import { test, expect } from "@playwright/test";
import {
  E2E_ACCOUNT,
  SEED_ACCOUNTS,
  SEED_NAMES,
  deleteSessionViaUi,
  guardWrites,
  login,
  openExitSheet,
  startSession,
} from "./helpers";

// CM-88 (PR 4) : l'accueil est lu depuis le NAVIGATEUR (client Supabase anon
// + session en cookie, sous RLS). Écrit en base : l'accueil purge les séances
// vides abandonnées (CM-83) et un parcours démarre puis abandonne une séance
// (supprimée par l'UI quoi qu'il arrive). Données de supabase/seed.sql.

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

  test("après l'abandon d'une séance, l'accueil n'affiche jamais un « Reprendre » périmé", async ({ page }) => {
    await login(page, E2E_ACCOUNT.email, E2E_ACCOUNT.password);
    const id = await startSession(page);
    try {
      // Abandon par la server action du logger, qui redirige vers l'accueil.
      const sheet = await openExitSheet(page);
      await sheet.getByRole("button", { name: "Abandonner" }).click();
      await expect(page).toHaveURL(/\/dashboard$/);
      await expect(page.getByRole("heading", { name: /^Salut,/ })).toBeVisible();

      // Vérification IMMÉDIATE, sans réessai : pas même un instant de bandeau
      // venu du cache d'avant l'abandon.
      const resume = page.getByRole("link", { name: "Reprendre" });
      expect(await resume.count()).toBe(0);
      // Et toujours rien une fois l'accueil relu.
      await page.waitForLoadState("networkidle");
      expect(await resume.count()).toBe(0);
    } finally {
      await deleteSessionViaUi(page, id);
    }
  });

  test("un message d'erreur en query string s'affiche (CM-70)", async ({ page }) => {
    await login(page, SEED_ACCOUNTS.solo.email, SEED_ACCOUNTS.solo.password);
    await page.goto(`/dashboard?error=${encodeURIComponent("Séance introuvable")}`);
    await expect(
      page.getByRole("alert").filter({ hasText: "Séance introuvable" }),
    ).toBeVisible();
  });
});
