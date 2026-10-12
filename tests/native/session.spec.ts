import { test, expect } from "@playwright/test";
import { SEED_ACCOUNTS, guardWrites, login, sessionPath } from "../e2e/helpers";
import { forbidServerRequests, servedFile, trackDocuments } from "./helpers";

// CM-89 (PR 3) : export natif avec une session (compte « Toi » du seed).
// Ne crée rien, mais le tableau de bord purge les séances vides abandonnées
// (CM-83) : garde-fou obligatoire, comme pour les e2e.

/** Séance terminée de « Toi » (seed), séance type « Haut du corps ». */
const TOI_SESSION = "77777777-7777-7777-7777-000000000001";

guardWrites();
forbidServerRequests();

test("la connexion mène au tableau de bord après le rechargement complet", async ({ page }) => {
  const documents = trackDocuments(page);
  await login(page, SEED_ACCOUNTS.toi.email, SEED_ACCOUNTS.toi.password);
  // `window.location.assign` : nouveau document, servi par dashboard.html
  // (pas la racine, qui redirigerait elle-même).
  expect(documents).toContainEqual(["/dashboard", "dashboard.html"]);
  expect(documents).not.toContainEqual(["/dashboard", "index.html"]);
});

test("rechargement complet du Carnet : l'écran du Carnet, pas la racine", async ({ page }) => {
  await login(page, SEED_ACCOUNTS.toi.email, SEED_ACCOUNTS.toi.password);

  const response = await page.goto("/history");
  expect(servedFile(response)).toBe("history.html");
  await expect(page.getByRole("heading", { name: "Historique", level: 1 })).toBeVisible();
  await expect(page.locator(`a[href="${sessionPath(TOI_SESSION)}"]`)).toBeVisible();

  const reloaded = await page.reload();
  expect(servedFile(reloaded)).toBe("history.html");
  await expect(page).toHaveURL(/\/history$/);
  await expect(page.getByRole("heading", { name: "Historique", level: 1 })).toBeVisible();
});

test("rechargement complet d'une séance : le récap de cette séance", async ({ page }) => {
  await login(page, SEED_ACCOUNTS.toi.email, SEED_ACCOUNTS.toi.password);

  const response = await page.goto(sessionPath(TOI_SESSION));
  expect(servedFile(response)).toBe("sessions/view.html");
  await expect(page.getByText("Volume total")).toBeVisible();

  const reloaded = await page.reload();
  expect(servedFile(reloaded)).toBe("sessions/view.html");
  await expect(page).toHaveURL(new RegExp(`/sessions/view\\?id=${TOI_SESSION}$`));
  await expect(page.getByText("Volume total")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Haut du corps", level: 1 })).toBeVisible();
});
