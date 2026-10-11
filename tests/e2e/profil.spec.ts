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

  test("CM-88 : le Profil est lu et enregistré depuis le navigateur", async ({ page }) => {
    await login(page, E2E_ACCOUNT.email, E2E_ACCOUNT.password);
    // Aucune requête Supabase côté serveur pour cet écran : les lectures et
    // l'écriture partent du navigateur, sous RLS.
    const supabaseCalls: string[] = [];
    page.on("request", (r) => {
      if (r.url().includes("/rest/v1/")) supabaseCalls.push(`${r.method()} ${new URL(r.url()).pathname}`);
    });
    await page.goto("/profile");
    const section = page.getByRole("region", { name: "Mon profil" });
    await expect(section).toContainText("Prénom");
    await expect(page.getByRole("region", { name: "Mes données" })).toBeVisible();
    await expect(page.getByText("Badges", { exact: true })).toBeVisible();
    expect(supabaseCalls.some((c) => c.startsWith("GET /rest/v1/profiles"))).toBe(true);

    // Enregistrer sans rien changer : écriture refaite à l'identique (aucune
    // donnée du seed modifiée), confirmation, puis lecture à jour.
    const goalRow = section
      .locator("div", { has: page.getByText("Objectif par semaine", { exact: true }) })
      .last();
    const goal = (await goalRow.innerText()).replace("Objectif par semaine", "").trim();
    expect(goal).toMatch(/^\d+\sséances?$/);
    await section.getByRole("button", { name: "Modifier" }).click();
    await section.getByRole("button", { name: "Enregistrer" }).click();
    await expect(section.getByRole("status")).toHaveText("Profil enregistré.");
    await expect(section.getByRole("button", { name: "Modifier" })).toBeVisible();
    await expect(section).toContainText(goal!);
    expect(supabaseCalls).toContain("PATCH /rest/v1/profiles");
  });
});
