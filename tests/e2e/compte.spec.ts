import { readFileSync } from "node:fs";
import { test, expect, type Page } from "@playwright/test";
import { SEED_ACCOUNTS, guardWrites, login } from "./helpers";

// CM-60 : export des données et suppression du compte (Profil, « Mes
// données »). La suppression vise un compte CRÉÉ par le test (inscription,
// email unique en `.test`) : rejouable, et les comptes du seed restent en
// place pour les autres parcours (la CI rejoue tout avec DATA_CLIENT=service).
// Nécessite NEXT_PUBLIC_SIGNUP_ENABLED=1 au build (job e2e de la CI).

guardWrites();

const EXPORT_NAME = /^coach-en-muscu-export-\d{4}-\d{2}-\d{2}\.zip$/;

/** Clique « Exporter mes données » et renvoie le nom et le contenu du fichier. */
async function exportData(page: Page): Promise<{ name: string; text: string; bytes: number }> {
  await page.goto("/profile");
  const section = page.getByRole("region", { name: "Mes données" });
  await expect(section).toBeVisible();
  // Branche « téléchargement » (la feuille de partage du système n'est pas
  // pilotable ici ; les deux branches sont testées en unitaire).
  await page.evaluate(() => {
    Object.defineProperty(navigator, "canShare", { value: () => false, configurable: true });
  });
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    section.getByRole("button", { name: /Exporter mes données/ }).click(),
  ]);
  const path = await download.path();
  const buf = readFileSync(path);
  // ZIP « stored » (sans compression) : le CSV et le JSON y sont en clair.
  expect(buf.subarray(0, 4).toString("binary")).toBe("PK\u0003\u0004");
  return { name: download.suggestedFilename(), text: buf.toString("utf8"), bytes: buf.length };
}

test.describe("Mes données (CM-60)", () => {
  test("Solo exporte ses données : ZIP non vide avec ses séances", async ({ page }) => {
    await login(page, SEED_ACCOUNTS.solo.email, SEED_ACCOUNTS.solo.password);
    const file = await exportData(page);
    expect(file.name).toMatch(EXPORT_NAME);
    expect(file.bytes).toBeGreaterThan(500);
    expect(file.text).toContain("seances-et-series.csv");
    expect(file.text).toContain("donnees-completes.json");
    // Séance du seed : « Full body », une série de squat à 60 kg.
    expect(file.text).toContain("Date;Séance type;Exercice;Série;Poids (kg);Répétitions;Échauffement");
    expect(file.text).toMatch(/;Full body;Squat barre;1;60;10;non/);
    expect(file.text).toContain('"email": "solo@coach-en-muscu.test"');
    expect(file.text).toContain("Séance solo (seed)");
  });

  test("Lina exporte : rien de Théo, même s'il est visible dans le duo", async ({ page }) => {
    await login(page, SEED_ACCOUNTS.elle.email, SEED_ACCOUNTS.elle.password);
    const file = await exportData(page);
    expect(file.name).toMatch(EXPORT_NAME);
    expect(file.text).toContain('"email": "elle@coach-en-muscu.test"');
    expect(file.text).not.toContain("toi@coach-en-muscu.test");
    expect(file.text).not.toContain("Séance de test (seed)");
    expect(file.text).not.toContain('"prenom": "Théo"');
    // Bibliothèque du duo incluse, marquée partagée (séances types du seed).
    expect(file.text).toMatch(/"nom": "Haut du corps",\s+"bibliotheque": "Nos séances",\s+"partagee": true/);
  });

  test("CM-88 : suppression refusée par la base : message, on reste sur le Profil, session intacte", async ({ page }) => {
    await login(page, SEED_ACCOUNTS.solo.email, SEED_ACCOUNTS.solo.password);
    // Refus simulé : la requête n'atteint jamais la base (compte du seed intact).
    let rpcCalls = 0;
    await page.route("**/rest/v1/rpc/delete_my_account", (route) => {
      rpcCalls += 1;
      return route.fulfill({
        status: 400,
        contentType: "application/json",
        body: JSON.stringify({ code: "P0001", message: "refus simulé", details: null, hint: null }),
      });
    });
    await page.goto("/profile");
    const section = page.getByRole("region", { name: "Mes données" });
    await section.getByRole("button", { name: /Supprimer mon compte/ }).click();
    const sheet = page.getByRole("dialog");
    await sheet.getByRole("button", { name: "Continuer" }).click();
    await sheet.getByLabel("Mot de confirmation").fill("SUPPRIMER");
    await sheet.getByRole("button", { name: "Supprimer définitivement" }).click();

    await expect(sheet.getByRole("alert")).toContainText("Rien n'a été supprimé");
    expect(rpcCalls).toBe(1);
    await expect(page).toHaveURL(/\/profile$/);
    // Le bouton redevient utilisable, la saisie est conservée.
    await expect(sheet.getByRole("button", { name: "Supprimer définitivement" })).toBeEnabled();
    await expect(sheet.getByLabel("Mot de confirmation")).toHaveValue("SUPPRIMER");

    // Session intacte : le Profil se recharge, sans passer par /login.
    await page.unroute("**/rest/v1/rpc/delete_my_account");
    await page.reload();
    await expect(page).toHaveURL(/\/profile$/);
    await expect(page.getByRole("region", { name: "Mon profil" })).toBeVisible();
  });

  test("un nouveau compte se supprime, puis ne peut plus se connecter", async ({ page }) => {
    const email = `cm60-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@coach-en-muscu.test`;
    const password = "motdepasse-cm60";

    // Inscription, onboarding avec le modèle par défaut (3 séances types).
    await page.goto("/signup");
    await expect(page.getByRole("heading", { name: "Crée ton compte" })).toBeVisible();
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Mot de passe", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Continuer" }).click();
    await expect(page).toHaveURL(/\/onboarding$/);
    await page.getByLabel("Prénom").fill("Jetable");
    await page.getByRole("button", { name: "Continuer" }).click();
    await expect(page).toHaveURL(/\/onboarding\/seances$/);
    await page.getByRole("button", { name: "Ajouter et c'est parti" }).click();
    await expect(page).toHaveURL(/\/dashboard$/);

    // Une série en attente sur ce téléphone : annoncée, puis effacée.
    await page.goto("/profile");
    await page.evaluate(() =>
      window.localStorage.setItem("cm:pendingSets:00000000-0000-0000-0000-000000000060", '[{"x":1}]'),
    );

    const section = page.getByRole("region", { name: "Mes données" });
    await section.getByRole("button", { name: /Supprimer mon compte/ }).click();
    const sheet = page.getByRole("dialog");
    await expect(sheet.getByRole("heading", { name: "Supprimer ton compte ?" })).toBeVisible();
    await expect(sheet.getByRole("list", { name: "Ce qui est supprimé" })).toContainText(
      "Toutes tes séances et tes séries",
    );
    await expect(sheet).toContainText("1 élément pas encore enregistré");
    await expect(sheet.getByRole("button", { name: "Exporter mes données" })).toBeVisible();
    // Solo : aucun partenaire annoncé.
    await expect(sheet.getByRole("list", { name: "Ce que garde ton partenaire" })).toHaveCount(0);

    // Annuler ne supprime rien.
    await sheet.getByRole("button", { name: "Annuler" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await section.getByRole("button", { name: /Supprimer mon compte/ }).click();
    await sheet.getByRole("button", { name: "Continuer" }).click();

    // Étape 2 : le bouton n'est actif qu'avec le bon mot.
    const confirm = sheet.getByRole("button", { name: "Supprimer définitivement" });
    const word = sheet.getByLabel("Mot de confirmation");
    await expect(word).toBeFocused();
    await expect(confirm).toBeDisabled();
    await word.fill("SUPPRIME");
    await expect(confirm).toBeDisabled();
    await word.fill("supprimer");
    await expect(confirm).toBeEnabled();
    await confirm.click();

    await expect(page).toHaveURL(/\/compte-supprime$/);
    await expect(page.getByRole("heading", { name: "Ton compte est supprimé." })).toBeVisible();
    await expect
      .poll(() => page.evaluate(() => window.localStorage.getItem("cm:pendingSets:00000000-0000-0000-0000-000000000060")))
      .toBeNull();

    // Session fermée : le profil renvoie à la connexion.
    await page.goto("/profile");
    await expect(page).toHaveURL(/\/login/);

    // Les identifiants ne fonctionnent plus.
    await page.goto("/login");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Mot de passe").fill(password);
    await page.getByRole("button", { name: "Se connecter" }).click();
    await expect(page.getByRole("alert")).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
  });
});
