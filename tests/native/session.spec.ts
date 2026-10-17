import { test, expect } from "@playwright/test";
import { SEED_ACCOUNTS, guardWrites, login, sessionPath } from "../e2e/helpers";
import { guardNativeRequests, servedFile, trackDocuments } from "./helpers";

// CM-89 (PR 3) : export natif avec une session (compte « Toi » du seed).
// Ne crée rien, mais le tableau de bord purge les séances vides abandonnées
// (CM-83) : garde-fou obligatoire, comme pour les e2e.

/** Séance terminée de « Toi » (seed), séance type « Haut du corps ». */
const TOI_SESSION = "77777777-7777-7777-7777-000000000001";

guardWrites();
guardNativeRequests();

test("la connexion mène au tableau de bord après le rechargement complet", async ({ page }) => {
  const documents = trackDocuments(page);
  await login(page, SEED_ACCOUNTS.toi.email, SEED_ACCOUNTS.toi.password);
  // `window.location.assign` : nouveau document, servi par dashboard.html
  // (pas la racine, qui redirigerait elle-même).
  expect(documents).toContainEqual(["/dashboard", "dashboard.html"]);
  expect(documents).not.toContainEqual(["/dashboard", "index.html"]);
});

test("navigation dans l'app vers le Carnet : sans rechargement, charge RSC en 200", async ({ page }) => {
  // Charge utile RSC du Carnet (`/history.txt?_rsc=…`), préchargée ou lue au clic.
  const payloads: number[] = [];
  page.on("response", (response) => {
    if (new URL(response.url()).pathname === "/history.txt") payloads.push(response.status());
  });
  await login(page, SEED_ACCOUNTS.toi.email, SEED_ACCOUNTS.toi.password);

  const documents = trackDocuments(page);
  // CM-117 : Carnet = onglet Progrès, vue Historique.
  await page.getByRole("link", { name: "Progrès", exact: true }).click();
  await page.getByRole("link", { name: "Historique", exact: true }).click();
  await expect(page).toHaveURL(/\/history$/);
  await expect(page.getByRole("link", { name: "Historique", exact: true })).toHaveAttribute("aria-current", "page");

  // Aucun nouveau document : navigation client, toujours le document du
  // tableau de bord.
  expect(documents).toEqual([]);
  const navigations = await page.evaluate(() =>
    performance.getEntriesByType("navigation").map((entry) => new URL(entry.name).pathname),
  );
  expect(navigations).toEqual(["/dashboard"]);
  expect(payloads.length).toBeGreaterThan(0);
  expect(payloads.every((status) => status === 200)).toBe(true);
});

test("rechargement complet du Carnet : l'écran du Carnet, pas la racine", async ({ page }) => {
  await login(page, SEED_ACCOUNTS.toi.email, SEED_ACCOUNTS.toi.password);

  const response = await page.goto("/history");
  expect(servedFile(response)).toBe("history.html");
  await expect(page.getByRole("link", { name: "Historique", exact: true })).toHaveAttribute("aria-current", "page");
  await expect(page.locator(`a[href="${sessionPath(TOI_SESSION)}"]`)).toBeVisible();

  const reloaded = await page.reload();
  expect(servedFile(reloaded)).toBe("history.html");
  await expect(page).toHaveURL(/\/history$/);
  await expect(page.getByRole("link", { name: "Historique", exact: true })).toHaveAttribute("aria-current", "page");
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
