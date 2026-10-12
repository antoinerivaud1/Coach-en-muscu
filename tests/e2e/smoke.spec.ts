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

  // CM-89 (PR 2) : l'éditeur lit l'id en query (`/seances/edit?id=`).
  await page.goto("/seances/edit?id=55555555-5555-5555-5555-000000000001");
  await expect(page).toHaveURL(
    /\/login\?next=%2Fseances%2Fedit%3Fid%3D55555555-5555-5555-5555-000000000001$/,
  );
});

// ---- CM-89 (PR 2) : plus de route dynamique, l'id passe en query ----

const OLD_ID = "55555555-5555-5555-5555-000000000001";

test("CM-89 (PR 2) : une séance sans session renvoie à la connexion, id et mode conservés", async ({ page }) => {
  await page.goto(`/sessions/view?id=${OLD_ID}&edit=1`);
  await expect(page).toHaveURL(
    new RegExp(`/login\\?next=%2Fsessions%2Fview%3Fid%3D${OLD_ID}%26edit%3D1$`),
  );
});

test("CM-89 (PR 2) : web, une ancienne adresse `/sessions/<uuid>` redirige vers `/sessions/view?id=`", async ({ page }) => {
  // Redirection de next.config.mjs (build web uniquement), temporaire.
  const res = await page.request.get(`/sessions/${OLD_ID}`, { maxRedirects: 0 });
  expect(res.status()).toBe(307);
  expect(new URL(res.headers()["location"]!, "http://x.invalid").pathname).toBe("/sessions/view");
  expect(new URL(res.headers()["location"]!, "http://x.invalid").searchParams.get("id")).toBe(OLD_ID);

  // La query d'origine suit (« Modifier », « Corriger les séries »).
  const edit = await page.request.get(`/sessions/${OLD_ID}?edit=1`, { maxRedirects: 0 });
  const editTarget = new URL(edit.headers()["location"]!, "http://x.invalid");
  expect(editTarget.searchParams.get("id")).toBe(OLD_ID);
  expect(editTarget.searchParams.get("edit")).toBe("1");

  // Dans le navigateur : nouvelle adresse, puis connexion avec retour prévu.
  await page.goto(`/sessions/${OLD_ID}`);
  await expect(page).toHaveURL(new RegExp(`/login\\?next=%2Fsessions%2Fview%3Fid%3D${OLD_ID}$`));
});

test("CM-89 (PR 2) : web, une ancienne adresse `/seances/<uuid>/edit` redirige vers `/seances/edit?id=`", async ({ page }) => {
  const res = await page.request.get(`/seances/${OLD_ID}/edit`, { maxRedirects: 0 });
  expect(res.status()).toBe(307);
  const target = new URL(res.headers()["location"]!, "http://x.invalid");
  expect(target.pathname).toBe("/seances/edit");
  expect(target.searchParams.get("id")).toBe(OLD_ID);
});

test("CM-89 (PR 2) : un id absent ou mal formé affiche « Séance introuvable »", async ({ page }) => {
  // Aucune lecture : rien à protéger, pas de détour par la connexion.
  for (const url of ["/sessions/view?id=not-a-uuid", "/sessions/view", "/seances/edit?id=not-a-uuid"]) {
    await page.goto(url);
    await expect(page.getByRole("heading", { name: "Séance introuvable" }), url).toBeVisible();
  }
  // Seuls les uuid sont redirigés : un ancien chemin quelconque reste un 404.
  const res = await page.request.get("/sessions/not-a-uuid", { maxRedirects: 0 });
  expect(res.status()).toBe(404);
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
