import { test, expect } from "@playwright/test";
import { SEED_ACCOUNTS, guardWrites, login } from "./helpers";

// CM-88 (socle) : le Guide est le premier écran lu depuis le NAVIGATEUR
// (client Supabase anon + session en cookie, sous RLS). Ne crée rien, mais la
// connexion passe par le tableau de bord, qui purge les séances vides
// abandonnées (CM-83) : garde-fou obligatoire. Données de supabase/seed.sql.

guardWrites();

test.describe("Guide des exercices lu côté client (CM-88)", () => {
  test("Théo voit le catalogue système, pas l'exercice perso de Solo", async ({ page }) => {
    await login(page, SEED_ACCOUNTS.toi.email, SEED_ACCOUNTS.toi.password);
    await page.goto("/guide");
    await expect(page.getByRole("heading", { name: "Guide des exercices" })).toBeVisible();
    await expect(page.getByRole("button", { name: /Développé couché barre/ })).toBeVisible();
    await expect(page.getByText("Exercice perso de Solo")).toHaveCount(0);
  });

  test("Solo voit son exercice perso", async ({ page }) => {
    await login(page, SEED_ACCOUNTS.solo.email, SEED_ACCOUNTS.solo.password);
    await page.goto("/guide");
    await expect(page.getByText("Exercice perso de Solo")).toBeVisible();
  });

  test("après déconnexion, le cache ne montre plus rien du compte précédent", async ({ page }) => {
    await login(page, SEED_ACCOUNTS.solo.email, SEED_ACCOUNTS.solo.password);
    await page.goto("/guide");
    await expect(page.getByText("Exercice perso de Solo")).toBeVisible();

    await page.context().clearCookies();
    await login(page, SEED_ACCOUNTS.toi.email, SEED_ACCOUNTS.toi.password);
    await page.goto("/guide");
    await expect(page.getByRole("button", { name: /Développé couché barre/ })).toBeVisible();
    await expect(page.getByText("Exercice perso de Solo")).toHaveCount(0);
  });

  test("une session ouverte avant CM-88 (cookie httpOnly) reste reconnue", async ({ page }) => {
    await login(page, SEED_ACCOUNTS.solo.email, SEED_ACCOUNTS.solo.password);
    // Remet les cookies de session dans l'état d'avant CM-88 : httpOnly, sans marqueur.
    const context = page.context();
    const cookies = await context.cookies();
    const session = cookies.filter((c) => c.name.startsWith("sb-") && c.name.includes("-auth-token"));
    expect(session.length).toBeGreaterThan(0);
    await context.clearCookies();
    await context.addCookies(session.map((c) => ({ ...c, httpOnly: true })));

    // Le middleware les réécrit lisibles dès la première requête : le Guide se charge.
    await page.goto("/guide");
    await expect(page.getByText("Exercice perso de Solo")).toBeVisible();
    const after = await context.cookies();
    expect(after.find((c) => c.name === "cm_auth_cookie_v")?.value).toBe("2");
    expect(after.filter((c) => session.some((s) => s.name === c.name)).every((c) => !c.httpOnly)).toBe(true);
  });
});

