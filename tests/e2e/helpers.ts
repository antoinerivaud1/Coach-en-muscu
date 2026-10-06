import { test, expect, type Page } from "@playwright/test";

/**
 * Outils partagés des parcours e2e qui ÉCRIVENT en base (CM-56).
 *
 * Données attendues dans la base de test : au moins un profil, et pour ce
 * profil au moins une séance type avec un exercice. Deux variables permettent
 * de cibler des données précises (sinon : premier profil, première séance non
 * vide de la grille) :
 *   E2E_PROFILE_NAME  nom affiché du profil (ex. « Antoine »)
 *   E2E_SEANCE_NAME   nom d'une séance type de ce profil
 */

/** Référence du seul projet Supabase existant : la prod. */
const PROD_PROJECT_REF = "drmmgwchoowggpsppilo";

/**
 * Garde-fou à appeler en tête de chaque fichier qui écrit. Sans
 * `E2E_ALLOW_WRITES=1`, tous les tests du fichier sont ignorés : un
 * `npm run test:e2e` lancé par réflexe contre la prod ne crée ni ne supprime
 * rien. Si une URL Supabase de prod traîne dans l'environnement du runner, on
 * refuse net (échec, pas simple saut).
 */
export function guardWrites(): void {
  for (const key of ["E2E_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL"]) {
    if (process.env[key]?.includes(PROD_PROJECT_REF)) {
      throw new Error(
        `${key} pointe vers la base de PROD (${PROD_PROJECT_REF}) : les e2e qui écrivent refusent de tourner.`,
      );
    }
  }
  test.skip(
    process.env.E2E_ALLOW_WRITES !== "1",
    "Parcours qui écrit en base : définir E2E_ALLOW_WRITES=1, et UNIQUEMENT contre une base de test.",
  );
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Id de séance extrait d'une URL `/sessions/<uuid>`. */
const SESSION_URL = /\/sessions\/([0-9a-f-]{36})(?:[?#]|$)/;

export function sessionIdFromUrl(url: string): string {
  const id = SESSION_URL.exec(url)?.[1];
  if (!id) throw new Error(`URL de séance inattendue : ${url}`);
  return id;
}

/** Sélecteur de profil (accueil) → tableau de bord. */
export async function selectProfile(page: Page): Promise<void> {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Qui s'entraîne/i })).toBeVisible();
  const name = process.env.E2E_PROFILE_NAME;
  const card = name
    ? page.getByRole("button", { name: new RegExp(escapeRegExp(name)) })
    : page.getByRole("button");
  await card.first().click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole("heading", { name: /^Salut,/ })).toBeVisible();
}

/**
 * Démarre une séance depuis la grille du tableau de bord et renvoie son id.
 * Les cartes de la grille portent « N exercice(s) » ; la ligne « Suggestion »
 * et les séances vides (« Séance vide », désactivées) sont donc exclues.
 */
export async function startSession(page: Page): Promise<string> {
  const name = process.env.E2E_SEANCE_NAME;
  let cards = page
    .getByRole("button")
    .filter({ hasText: /\d+ exercices?/ });
  if (name) cards = cards.filter({ hasText: name });
  await cards.first().click();
  await expect(page).toHaveURL(SESSION_URL);
  await expect(page.getByRole("button", { name: "Quitter la séance" })).toBeVisible();
  return sessionIdFromUrl(page.url());
}

/** Nom de l'exercice affiché dans le logger. */
export async function currentExerciseName(page: Page): Promise<string> {
  const heading = page.getByRole("heading", { level: 1 });
  await expect(heading).toBeVisible();
  return (await heading.innerText()).trim();
}

/**
 * Saisit poids et répétitions au clavier (CM-63) puis valide la série active.
 * Le repos qui démarre ensuite est passé, pour revenir à un écran stable.
 */
export async function logSet(
  page: Page,
  { weight, reps }: { weight: string; reps: string },
): Promise<void> {
  await page.getByRole("button", { name: "Modifier le poids au clavier" }).click();
  const weightInput = page.getByRole("textbox", { name: "Saisir le poids" });
  await weightInput.fill(weight);
  await weightInput.press("Enter");

  await page.getByRole("button", { name: "Modifier les répétitions au clavier" }).click();
  const repsInput = page.getByRole("textbox", { name: "Saisir les répétitions" });
  await repsInput.fill(reps);
  await repsInput.press("Enter");

  await page.getByRole("button", { name: "Valider la série" }).click();

  // Le repos a deux « Passer » (anneau et barre épinglée) : le premier visible.
  const skip = page.getByRole("button", { name: "Passer", exact: true }).first();
  await expect(skip).toBeVisible();
  await skip.click();
}

/** Ouvre la feuille de sortie (CM-94) par la croix du logger. */
export async function openExitSheet(page: Page) {
  await page.getByRole("button", { name: "Quitter la séance" }).click();
  const sheet = page.getByRole("dialog");
  await expect(sheet).toBeVisible();
  return sheet;
}

/**
 * Nettoyage d'une séance créée par un test, quel que soit son état, par l'UI
 * uniquement (aucun accès direct à la base) :
 * - en cours, sans série : croix → « Abandonner » ;
 * - en cours, avec séries : croix → « Supprimer la séance » → « Supprimer » ;
 * - terminée (récap) : « Supprimer ».
 * Idempotent : une séance déjà supprimée (404) ne fait rien.
 */
export async function deleteSessionViaUi(page: Page, sessionId: string): Promise<void> {
  const res = await page.goto(`/sessions/${sessionId}`);
  if (res?.status() === 404) return;

  const quit = page.getByRole("button", { name: "Quitter la séance" });
  const recapDelete = page.getByRole("button", { name: "Supprimer", exact: true });
  await expect(quit.or(recapDelete).first()).toBeVisible();

  if (await quit.isVisible()) {
    const sheet = await openExitSheet(page);
    const abandon = sheet.getByRole("button", { name: "Abandonner" });
    if (await abandon.isVisible()) {
      await abandon.click();
    } else {
      await sheet.getByRole("button", { name: "Supprimer la séance" }).click();
      await sheet.getByRole("button", { name: "Supprimer", exact: true }).click();
    }
    await expect(page).toHaveURL(/\/dashboard(\?|$)/);
    return;
  }

  await recapDelete.click();
  await expect(page).toHaveURL(/\/history$/);
}
