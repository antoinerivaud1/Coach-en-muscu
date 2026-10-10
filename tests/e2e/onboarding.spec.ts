import { test, expect, type Page } from "@playwright/test";
import { SEED_ACCOUNTS, guardWrites, login } from "./helpers";

// CM-86 : onboarding solo. Crée de VRAIS comptes (emails uniques en `.test`)
// dans la base locale de la CI : garde-fou obligatoire. Nécessite
// SIGNUP_ENABLED=1 côté app (job e2e de la CI) et l'inscription ouverte dans
// la stack Supabase locale (supabase/config.toml).

guardWrites();

const PASSWORD = "motdepasse-onboarding";

function uniqueEmail(tag: string): string {
  const rand = Math.random().toString(36).slice(2, 8);
  return `cm86-${tag}-${Date.now()}-${rand}@coach-en-muscu.test`;
}

/** Bienvenue → inscription → arrivée sur l'étape profil de l'onboarding. */
async function signUp(page: Page, email: string): Promise<void> {
  await page.goto("/welcome");
  await page.getByRole("link", { name: "Créer un compte avec un email" }).click();
  await expect(page).toHaveURL(/\/signup$/);
  await expect(page.getByRole("heading", { name: "Crée ton compte" })).toBeVisible();
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Mot de passe", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Continuer" }).click();
  await expect(page).toHaveURL(/\/onboarding$/);
  await expect(page.getByRole("heading", { name: /Comment on t.appelle/ })).toBeVisible();
}

/** Étape profil : prénom, couleur, objectif. */
async function fillProfile(page: Page, firstName: string): Promise<void> {
  await page.getByLabel("Prénom").fill(firstName);
  await page.getByRole("radio", { name: "Orange" }).click();
  await expect(page.getByRole("radio", { name: "Orange" })).toHaveAttribute("aria-checked", "true");
  // 3 par défaut, puis 4.
  await expect(page.locator("output")).toHaveText("3");
  await page.getByRole("button", { name: "Une séance de plus" }).click();
  await expect(page.locator("output")).toHaveText("4");
  await page.getByRole("button", { name: "Continuer" }).click();
  await expect(page).toHaveURL(/\/onboarding\/seances$/);
  await expect(
    page.getByRole("heading", { name: new RegExp(`Par quoi tu commences, ${firstName}`) }),
  ).toBeVisible();
}

test.describe("Onboarding solo (CM-86)", () => {
  test("inscription, onboarding complet, modèle ajouté, accueil du premier jour", async ({ page }) => {
    await signUp(page, uniqueEmail("modele"));

    // Pas encore onboardé : toute page privée renvoie à l'onboarding.
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/onboarding$/);

    // Prénom obligatoire.
    await page.getByLabel("Prénom").fill("");
    await page.getByRole("button", { name: "Continuer" }).click();
    await expect(page.getByText("Indique ton prénom.")).toBeVisible();

    await fillProfile(page, "Camille");

    // Modèle par défaut (Push · Pull · Jambes) ajouté en un tap.
    await expect(page.getByRole("radio", { name: /Push · Pull · Jambes/ })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    await page.getByRole("button", { name: "Ajouter et c'est parti" }).click();

    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByRole("heading", { name: /^Salut, Camille/ })).toBeVisible();
    const today = page.getByRole("region", { name: "Aujourd'hui" });
    await expect(today).toBeVisible();
    await expect(today).toContainText("Push");
    // Seed de la CI : extrait du catalogue (81 en prod), un modèle peut y
    // perdre un exercice ; le nombre exact n'est donc pas figé ici.
    await expect(today).toContainText(/\d\u00a0exercices? · environ\u00a0\d+\u00a0min/);
    await expect(today.getByRole("button", { name: "Démarrer la séance" })).toBeVisible();
    await expect(page.getByRole("region", { name: "Cette semaine" })).toContainText("0 / 4");
    // Aucune section duo pour un solo.
    await expect(page.getByText(/En binôme/)).toHaveCount(0);

    // Les 3 séances du modèle sont dans la bibliothèque perso.
    await page.goto("/seances");
    for (const name of ["Push", "Pull", "Jambes"]) {
      await expect(page.getByText(name, { exact: true }).first()).toBeVisible();
    }

    // Onboarding terminé : /onboarding renvoie à l'accueil.
    await page.goto("/onboarding");
    await expect(page).toHaveURL(/\/dashboard$/);

    // Profil : prénom, couleur et objectif choisis.
    await page.goto("/profile");
    const section = page.getByRole("region", { name: "Mon profil" });
    await expect(section).toContainText("Camille");
    await expect(section).toContainText("Orange");
    await expect(section).toContainText("4 séances");
  });

  test("un solo passe l'onboarding, crée un exercice perso et le retrouve dans le catalogue", async ({ page }) => {
    await signUp(page, uniqueEmail("exo"));
    await fillProfile(page, "Sacha");
    await page.getByRole("button", { name: "Passer pour l'instant" }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByRole("heading", { name: /^Salut,/ })).toBeVisible();

    const exercise = `Exo perso ${Date.now().toString(36)}`;
    const seance = `Séance ${Date.now().toString(36)}`;

    await page.goto("/seances/new");
    await page.getByRole("button", { name: "+ Ajouter un exercice" }).click();
    const sheet = page.getByRole("dialog", { name: "Ajouter un exercice" });
    await sheet.getByRole("button", { name: "+ Créer un exercice" }).click();
    await sheet.getByPlaceholder("Nom de l'exercice").fill(exercise);
    await sheet.getByRole("button", { name: "Ajouter à la séance" }).click();
    await expect(page.getByText(exercise).first()).toBeVisible();

    // Séance perso enregistrée (plus de refus « en couple »).
    await page.getByRole("button", { name: "Modifier le nom de la séance" }).click();
    const nameInput = page.getByRole("textbox", { name: "Nom de la séance" });
    await nameInput.fill(seance);
    await nameInput.press("Enter");
    await page.getByRole("button", { name: /Enregistrer la séance/ }).click();
    await expect(page).toHaveURL(/\/seances$/);
    await expect(page.getByText(seance).first()).toBeVisible();

    // L'exercice perso est dans le catalogue (guide).
    await page.goto("/guide");
    await expect(page.getByText(exercise, { exact: true })).toBeVisible();

    // Et dans le catalogue d'une nouvelle séance.
    await page.goto("/seances/new");
    await page.getByRole("button", { name: "+ Ajouter un exercice" }).click();
    await page.getByRole("searchbox", { name: "Rechercher un exercice" }).fill(exercise);
    await expect(
      page.getByRole("dialog", { name: "Ajouter un exercice" }).getByText(exercise, { exact: true }),
    ).toBeVisible();
  });

  test("un compte déjà onboardé n'est jamais redirigé vers /onboarding", async ({ page }) => {
    await login(page, SEED_ACCOUNTS.toi.email, SEED_ACCOUNTS.toi.password);
    for (const path of ["/", "/dashboard", "/profile", "/seances", "/history"]) {
      await page.goto(path);
      await expect(page, path).not.toHaveURL(/\/onboarding/);
    }
    await page.goto("/onboarding");
    await expect(page).toHaveURL(/\/dashboard$/);
    await page.goto("/onboarding/seances");
    await expect(page).toHaveURL(/\/dashboard$/);
  });
});
