import { test, expect } from "@playwright/test";
import { guardNativeRequests, servedFile } from "./helpers";

// CM-89 (PR 3) : export natif, lecture seule, sans session. Les règles
// d'adresse testées ici sont celles que le routeur iOS de la PR 4 doit
// reproduire (NATIVE.md).

guardNativeRequests();

test("la connexion s'affiche sur /login, servie par login.html", async ({ page }) => {
  const response = await page.goto("/login");
  expect(servedFile(response)).toBe("login.html");
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole("heading", { name: /Connexion/ })).toBeVisible();
  await expect(page.getByLabel("Email")).toBeVisible();
});

test("adresses sans extension : <chemin>.html, puis <chemin>/index.html, sinon la racine", async ({ request }) => {
  const cases: Array<[string, string]> = [
    ["/", "index.html"],
    ["/dashboard", "dashboard.html"],
    ["/history", "history.html"],
    // La query ne choisit pas le fichier.
    ["/sessions/view?id=77777777-7777-7777-7777-000000000001&edit=1", "sessions/view.html"],
    ["/seances/edit?id=55555555-5555-5555-5555-000000000001", "seances/edit.html"],
    // `duo/rejoindre.html` ET un dossier `duo/rejoindre/` : le fichier gagne.
    ["/duo/rejoindre?code=ABC", "duo/rejoindre.html"],
    ["/duo/rejoindre/confirmer", "duo/rejoindre/confirmer.html"],
    ["/legal/cgu", "legal/cgu.html"],
    ["/compte-supprime", "compte-supprime.html"],
    // Page web seulement : absente du bundle, donc la racine.
    ["/sentry-test", "index.html"],
    // Ancienne adresse à segment (redirigée sur le web seulement) : la racine.
    ["/sessions/77777777-7777-7777-7777-000000000001", "index.html"],
  ];
  for (const [path, file] of cases) {
    const response = await request.get(path);
    expect(response.status(), path).toBe(200);
    expect(servedFile(response), path).toBe(file);
  }
});

test("aucun serveur : repli signalé, 405 pour tout sauf GET et HEAD", async ({ request }) => {
  expect((await request.get("/inconnu")).headers()["x-native-fallback"]).toBe("1");
  expect((await request.get("/dashboard")).headers()["x-native-fallback"]).toBeUndefined();
  expect((await request.head("/dashboard")).status()).toBe(200);
  // Une server action ou un route handler (POST) n'a rien pour répondre.
  expect((await request.post("/login", { data: {} })).status()).toBe(405);
  expect((await request.post("/api/inexistant", { data: {} })).status()).toBe(405);
  expect((await request.delete("/dashboard")).status()).toBe(405);
});

test("fichiers avec extension : servis tels quels, 404 s'ils manquent", async ({ request }) => {
  const manifest = await request.get("/manifest.webmanifest");
  expect(manifest.status()).toBe(200);
  expect(await manifest.json()).toMatchObject({ start_url: "/dashboard" });

  // Charge utile RSC des navigations client (export statique).
  expect((await request.get("/dashboard.txt")).status()).toBe(200);

  expect((await request.get("/_next/static/inexistant.js")).status()).toBe(404);
  expect((await request.get("/inexistant.png")).status()).toBe(404);
});
