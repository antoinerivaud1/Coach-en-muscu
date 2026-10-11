import { test, expect, type Page } from "@playwright/test";
import { SEED_ACCOUNTS, guardWrites, login } from "./helpers";

// CM-88 (socle) : le Guide est le premier écran lu depuis le NAVIGATEUR
// (client Supabase anon + session en cookie, sous RLS). Ne crée rien, mais la
// connexion passe par le tableau de bord, qui purge les séances vides
// abandonnées (CM-83) : garde-fou obligatoire. Données de supabase/seed.sql.

guardWrites();

const PERSO_SOLO = "Exercice perso de Solo";

/** Remplit le formulaire de connexion déjà affiché (sans recharger la page). */
async function fillLogin(page: Page, email: string, password: string) {
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Mot de passe").fill(password);
  await page.getByRole("button", { name: "Se connecter" }).click();
}

/** Profil → « Guide des exercices », par navigation client (sans `goto`). */
async function openGuideFromProfile(page: Page) {
  await page.getByRole("link", { name: "Profil" }).click();
  await expect(page).toHaveURL(/\/profile$/);
  await page.getByRole("link", { name: /Guide des exercices/ }).click();
  await expect(page).toHaveURL(/\/guide$/);
}

test.describe("Guide des exercices lu côté client (CM-88)", () => {
  test("Théo voit le catalogue système, pas l'exercice perso de Solo", async ({ page }) => {
    await login(page, SEED_ACCOUNTS.toi.email, SEED_ACCOUNTS.toi.password);
    await page.goto("/guide");
    await expect(page.getByRole("heading", { name: "Guide des exercices" })).toBeVisible();
    await expect(page.getByRole("button", { name: /Développé couché barre/ })).toBeVisible();
    await expect(page.getByText(PERSO_SOLO)).toHaveCount(0);
  });

  test("Solo voit son exercice perso", async ({ page }) => {
    await login(page, SEED_ACCOUNTS.solo.email, SEED_ACCOUNTS.solo.password);
    await page.goto("/guide");
    await expect(page.getByText(PERSO_SOLO)).toBeVisible();
  });

  test("déconnexion puis autre compte sur le même téléphone : rien du compte précédent", async ({ page }) => {
    await login(page, SEED_ACCOUNTS.solo.email, SEED_ACCOUNTS.solo.password);
    await openGuideFromProfile(page);
    await expect(page.getByText(PERSO_SOLO)).toBeVisible();

    // Tout par l'interface, aucun `page.goto` : le cache du navigateur n'est
    // vidé que si la déconnexion et la connexion le garantissent.
    await page.getByRole("link", { name: "Profil" }).click();
    await page.getByRole("button", { name: "Se déconnecter" }).click();
    await expect(page).toHaveURL(/\/login$/);
    await fillLogin(page, SEED_ACCOUNTS.toi.email, SEED_ACCOUNTS.toi.password);
    await expect(page).toHaveURL(/\/dashboard$/);

    await openGuideFromProfile(page);
    await expect(page.getByRole("button", { name: /Développé couché barre/ })).toBeVisible();
    await expect(page.getByText(PERSO_SOLO)).toHaveCount(0);
  });

  test("ouvert sans session, le Guide revient après la connexion (pas de boucle)", async ({ page }) => {
    await page.goto("/guide");
    await expect(page).toHaveURL(/\/login\?next=%2Fguide$/);
    await fillLogin(page, SEED_ACCOUNTS.solo.email, SEED_ACCOUNTS.solo.password);
    await expect(page).toHaveURL(/\/guide$/);
    await expect(page.getByText(PERSO_SOLO)).toBeVisible();
  });

  test("une session ouverte avant CM-88 (cookie httpOnly) reste reconnue", async ({ page }) => {
    await login(page, SEED_ACCOUNTS.solo.email, SEED_ACCOUNTS.solo.password);
    const context = page.context();
    const session = (await context.cookies()).filter(
      (c) => c.name.startsWith("sb-") && c.name.includes("-auth-token"),
    );
    expect(session.length).toBeGreaterThan(0);
    // État d'avant CM-88 : cookies httpOnly, sans marqueur.
    await context.clearCookies();
    await context.addCookies(session.map((c) => ({ ...c, httpOnly: true })));

    // Le middleware les réécrit lisibles dès la première requête.
    await page.goto("/guide");
    await expect(page.getByText(PERSO_SOLO)).toBeVisible();
    const after = await context.cookies();
    expect(after.find((c) => c.name === "cm_auth_cookie_v")?.value).toMatch(/^2\./);
    expect(
      after.filter((c) => session.some((s) => s.name === c.name)).every((c) => !c.httpOnly),
    ).toBe(true);
  });

  test("cookies httpOnly malgré le marqueur (retour arrière Vercel) : passage par /login, pas de boucle", async ({ page }) => {
    await login(page, SEED_ACCOUNTS.solo.email, SEED_ACCOUNTS.solo.password);
    const context = page.context();
    const all = await context.cookies();
    expect(all.find((c) => c.name === "cm_auth_cookie_v")?.value).toMatch(/^2\./);
    // Marqueur conservé, cookies de session redevenus httpOnly.
    await context.clearCookies();
    await context.addCookies(
      all.map((c) =>
        c.name.startsWith("sb-") && c.name.includes("-auth-token") ? { ...c, httpOnly: true } : c,
      ),
    );

    // Le Guide ne voit pas la session → /login, qui réécrit les cookies et
    // renvoie au Guide, cette fois lisible.
    await page.goto("/guide");
    await expect(page).toHaveURL(/\/guide$/);
    await expect(page.getByText(PERSO_SOLO)).toBeVisible();
  });
});
