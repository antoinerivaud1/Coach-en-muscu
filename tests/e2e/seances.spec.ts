import { test, expect, type Page } from "@playwright/test";
import { SEED_ACCOUNTS, deleteSessionViaUi, guardWrites, login, sessionIdFromUrl } from "./helpers";

// CM-88 (PR 5) : bibliothèque et éditeur de séances types côté client. Les
// écritures partent du navigateur (RPC save_seance, duplicate_seance,
// move_seance ; suppression sous RLS). ÉCRIT en base : séances types « Pour
// moi » de Théo, au nom unique, supprimées par l'UI à la fin.

guardWrites();

/** Ajoute un exercice du catalogue système à la séance en cours d'édition. */
async function addExercise(page: Page, name: string) {
  await page.getByRole("button", { name: "+ Ajouter un exercice" }).first().click();
  const sheet = page.getByRole("dialog", { name: "Ajouter un exercice" });
  await sheet.getByRole("searchbox", { name: "Rechercher un exercice" }).fill(name);
  await sheet.getByRole("button", { name: new RegExp(name) }).first().click();
  await expect(sheet).toHaveCount(0);
}

async function setName(page: Page, name: string) {
  await page.getByRole("button", { name: "Modifier le nom de la séance" }).click();
  const input = page.getByRole("textbox", { name: "Nom de la séance" });
  await input.fill(name);
  await input.press("Enter");
}

/** Supprime par l'UI chaque séance de « Mes séances » dont le nom commence par `prefix`. */
async function cleanup(page: Page, prefix: string) {
  await page.goto("/seances");
  const mine = page.getByRole("region", { name: "Mes séances" });
  await expect(mine).toBeVisible();
  const cards = mine.locator("section").filter({ hasText: prefix });
  for (let n = await cards.count(); n > 0; n--) {
    const card = cards.first();
    await card.getByRole("button", { name: "Supprimer", exact: true }).click();
    await card.getByRole("button", { name: "Oui, supprimer" }).click();
    await expect(cards).toHaveCount(n - 1);
  }
}

test.describe("Séances types depuis le navigateur (CM-88, PR 5)", () => {
  test("créer, modifier, dupliquer, réordonner, démarrer puis supprimer", async ({ page }) => {
    const base = `E2E ${Date.now().toString(36)}`;
    const renamed = `${base} B`;
    await login(page, SEED_ACCOUNTS.toi.email, SEED_ACCOUNTS.toi.password);

    // Les écritures partent du navigateur : on les compte.
    const rpcCalls: string[] = [];
    page.on("request", (req) => {
      const m = /\/rest\/v1\/rpc\/(save_seance|duplicate_seance|move_seance)/.exec(req.url());
      if (m) rpcCalls.push(m[1]!);
    });

    try {
      // --- Création « Pour moi » ---
      await page.goto("/seances/new");
      await page
        .getByRole("radiogroup", { name: "Pour qui ?" })
        .getByRole("radio", { name: "Pour moi" })
        .click();
      await addExercise(page, "Développé couché barre");
      await addExercise(page, "Curl haltères");
      await setName(page, base);
      await page.getByRole("button", { name: /Enregistrer la séance/ }).click();
      await expect(page).toHaveURL(/\/seances$/);
      const mine = page.getByRole("region", { name: "Mes séances" });
      const card = mine.locator("section").filter({ hasText: base });
      await expect(card).toContainText("2 exercices");
      expect(rpcCalls).toContain("save_seance");

      // L'accueil la montre tout de suite (navigation de l'app, cache invalidé).
      await page.getByRole("link", { name: "‹ Accueil" }).click();
      await expect(page).toHaveURL(/\/dashboard$/);
      await expect(page.getByRole("button").filter({ hasText: base }).first()).toBeVisible();

      // --- Modification : nom et un exercice en moins ---
      await page.goto("/seances");
      await mine.locator("section").filter({ hasText: base }).getByRole("link", { name: "Modifier" }).click();
      await expect(page).toHaveURL(/\/seances\/[0-9a-f-]{36}\/edit$/);
      await page.getByRole("button", { name: "Retirer Curl haltères" }).click();
      await setName(page, renamed);
      await page.getByRole("button", { name: /Enregistrer la séance/ }).click();
      await expect(page).toHaveURL(/\/seances$/);
      const edited = mine.locator("section").filter({ hasText: renamed });
      await expect(edited).toContainText("1 exercice");
      await expect(edited).not.toContainText("Curl haltères");

      // --- Duplication : la copie arrive en fin de liste ---
      await edited.first().getByRole("button", { name: "Dupliquer" }).click();
      const copy = mine.locator("section").filter({ hasText: `${renamed} (copie)` });
      await expect(copy).toHaveCount(1);
      expect(rpcCalls).toContain("duplicate_seance");
      const titles = () => mine.getByRole("heading", { level: 2 }).allInnerTexts();
      const order = (await titles()).filter((t) => t.startsWith(base));
      expect(order).toEqual([renamed, `${renamed} (copie)`]);

      // --- Réordonnancement : la copie monte d'un cran ---
      await copy.getByRole("button", { name: `Monter la séance ${renamed} (copie)` }).click();
      await expect
        .poll(async () => (await titles()).filter((t) => t.startsWith(base)))
        .toEqual([`${renamed} (copie)`, renamed]);
      expect(rpcCalls).toContain("move_seance");
      // Relu depuis la base : l'ordre tient après un rechargement complet.
      await page.reload();
      await expect
        .poll(async () => (await titles()).filter((t) => t.startsWith(base)))
        .toEqual([`${renamed} (copie)`, renamed]);

      // --- Démarrer depuis la bibliothèque ---
      await mine
        .locator("section")
        .filter({ hasText: renamed })
        .filter({ hasNotText: "(copie)" })
        .getByRole("button", { name: "Démarrer" })
        .click();
      await expect(page).toHaveURL(/\/sessions\/[0-9a-f-]{36}/);
      await deleteSessionViaUi(page, sessionIdFromUrl(page.url()));

      // --- Suppression ---
      await page.goto("/seances");
      const copyCard = mine.locator("section").filter({ hasText: `${renamed} (copie)` });
      await copyCard.getByRole("button", { name: "Supprimer", exact: true }).click();
      await copyCard.getByRole("button", { name: "Oui, supprimer" }).click();
      await expect(mine.locator("section").filter({ hasText: `${renamed} (copie)` })).toHaveCount(0);
    } finally {
      await cleanup(page, base);
    }
  });

  test("une sauvegarde refusée par la base n'écrit rien et affiche le message", async ({ page }) => {
    const name = `E2E refus ${Date.now().toString(36)}`;
    await login(page, SEED_ACCOUNTS.toi.email, SEED_ACCOUNTS.toi.password);
    await page.route("**/rest/v1/rpc/save_seance", (route) =>
      route.fulfill({
        status: 403,
        contentType: "application/json",
        body: JSON.stringify({
          code: "42501",
          message: "permission denied for function save_seance",
          details: null,
          hint: null,
        }),
      }),
    );

    await page.goto("/seances/new");
    await page
      .getByRole("radiogroup", { name: "Pour qui ?" })
      .getByRole("radio", { name: "Pour moi" })
      .click();
    await addExercise(page, "Développé couché barre");
    await setName(page, name);
    await page.getByRole("button", { name: /Enregistrer la séance/ }).click();

    await expect(page.getByRole("alert").filter({ hasText: "Action refusée" })).toContainText(
      "Action refusée : ces données ne sont pas accessibles depuis ton compte.",
    );
    // L'éditeur reste ouvert avec le brouillon, rien n'est rangé.
    await expect(page).toHaveURL(/\/seances\/new$/);
    await expect(page.getByRole("button", { name: /Enregistrer la séance/ })).toBeEnabled();
    await page.unroute("**/rest/v1/rpc/save_seance");
    await page.goto("/seances");
    await expect(page.getByRole("heading", { name: "Séances", level: 1 })).toBeVisible();
    await expect(page.getByText(name)).toHaveCount(0);
  });

  test("une séance inaccessible ne s'ouvre pas dans l'éditeur", async ({ page }) => {
    // « Full body », séance perso de Solo (seed), ouverte par Théo.
    await login(page, SEED_ACCOUNTS.toi.email, SEED_ACCOUNTS.toi.password);
    await page.goto("/seances/99999999-9999-9999-9999-000000000002/edit");
    await expect(page.getByRole("heading", { name: "Séance introuvable" })).toBeVisible();
    await expect(page.getByText("Full body")).toHaveCount(0);
  });
});
