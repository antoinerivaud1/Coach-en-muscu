import { test, expect } from "@playwright/test";

// Lecture seule, sans session (CM-59 B : plus de sélecteur de profil).

test("l'accueil sans session renvoie à la connexion", async ({ page }) => {
  await page.goto("/");
  // CM-89 (PR 1) : `/` est une page client, `toHaveURL` attend la redirection.
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole("heading", { name: /Connexion/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: /Qui s'entraîne/i })).toHaveCount(0);
});

test("CM-89 (PR 1) : les anciens cookies `cm_profile` et `cm_onboarded` sont effacés (web)", async ({ page, baseURL }) => {
  await page.context().addCookies([
    { name: "cm_profile", value: "ancien", url: baseURL! },
    { name: "cm_onboarded", value: "ancien", url: baseURL!, httpOnly: true },
  ]);
  await page.goto("/");
  await expect(page).toHaveURL(/\/login$/);
  // Effacés par le middleware (plus par la route serveur de `/`).
  const names = (await page.context().cookies()).map((c) => c.name);
  expect(names).not.toContain("cm_profile");
  expect(names).not.toContain("cm_onboarded");
});

test("une page privée sans session renvoie à la connexion, avec retour prévu", async ({ page }) => {
  await page.goto("/dashboard");
  // CM-59 B / CM-88 : `next` ramène à la page demandée après connexion.
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

test("CM-88 : la bibliothèque et l'éditeur de séances sans session renvoient à la connexion", async ({ page }) => {
  await page.goto("/seances");
  await expect(page).toHaveURL(/\/login\?next=%2Fseances$/);
  await expect(page.getByLabel("Email")).toBeVisible();

  await page.goto("/seances/new");
  await expect(page).toHaveURL(/\/login\?next=%2Fseances%2Fnew$/);

  await page.goto("/seances/55555555-5555-5555-5555-000000000001/edit");
  await expect(page).toHaveURL(
    /\/login\?next=%2Fseances%2F55555555-5555-5555-5555-000000000001%2Fedit$/,
  );
});

test("CM-88 (PR 7) : un lien d'invitation sans session passe par la connexion, code conservé", async ({ page }) => {
  await page.goto("/duo/rejoindre?code=K7QM4P");
  await expect(page).toHaveURL(/\/login\?next=%2Fduo%2Frejoindre%3Fcode%3DK7QM4P$/);
  await expect(page.getByLabel("Email")).toBeVisible();
  // La confirmation aussi (écran client), avec son propre retour.
  await page.goto("/duo/rejoindre/confirmer?code=K7QM4P");
  await expect(page).toHaveURL(/\/login\?next=%2Fduo%2Frejoindre%2Fconfirmer%3Fcode%3DK7QM4P$/);
});

test("CM-88 (PR 7) : l'onboarding et l'écran d'invitation sans session renvoient à la connexion", async ({ page }) => {
  await page.goto("/onboarding");
  await expect(page).toHaveURL(/\/login\?next=%2Fonboarding$/);
  await page.goto("/duo/inviter");
  await expect(page).toHaveURL(/\/login\?next=%2Fduo%2Finviter$/);
});

test("CM-88 (PR 7) : bienvenue et inscription sans session s'affichent, `next` suit", async ({ page }) => {
  await page.goto("/welcome?next=%2Fduo%2Frejoindre%3Fcode%3DK7QM4P");
  await expect(page.getByRole("heading", { name: "Chaque série compte." })).toBeVisible();
  await expect(page.getByRole("link", { name: "J'ai déjà un compte" })).toHaveAttribute(
    "href",
    "/login?next=%2Fduo%2Frejoindre%3Fcode%3DK7QM4P",
  );
  await page.goto("/signup");
  // Ouverte ou fermée selon NEXT_PUBLIC_SIGNUP_ENABLED (build) : un des deux titres.
  await expect(
    page.getByRole("heading", { name: /Crée ton compte|Les inscriptions ouvriront bientôt/ }),
  ).toBeVisible();
});
