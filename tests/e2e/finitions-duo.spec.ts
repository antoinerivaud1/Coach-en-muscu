import { test, expect, type Page } from "@playwright/test";
import { SEED_ACCOUNTS, SEED_NAMES, guardWrites, login } from "./helpers";

// CM-103 : finitions du duo.
// - Invitation conservée à l'inscription : un invité SANS compte ouvre le lien
//   d'invitation, passe par /login, crée son compte (/welcome, /signup,
//   NEXT_PUBLIC_SIGNUP_ENABLED=1 au build en CI), fait l'onboarding et arrive sur la confirmation
//   de l'invitation, puis rejoint le duo.
// - Couleur unique dans le duo : Théo ne peut pas choisir la couleur de Lina
//   (grisée à l'écran, refusée par l'action serveur).
// ÉCRIT en base (compte créé, duo, invitation) : garde-fou obligatoire.
// Rejouable (la CI rejoue tout avec DATA_CLIENT=service) : email unique,
// Solo remis hors duo au début et à la fin, par l'UI.

guardWrites();

type Account = { email: string; password: string };

const PASSWORD = "motdepasse-invitation";

function uniqueEmail(): string {
  const rand = Math.random().toString(36).slice(2, 8);
  return `cm103-invite-${Date.now()}-${rand}@coach-en-muscu.test`;
}

async function signOut(page: Page) {
  await page.context().clearCookies();
}

/** Remet le compte hors duo : quitte le duo ou annule l'invitation en cours. */
async function ensureSolo(page: Page, account: Account) {
  await signOut(page);
  await login(page, account.email, account.password);
  await page.goto("/profile");
  const leave = page.getByRole("button", { name: "Quitter le duo" });
  const revoke = page.getByRole("button", { name: "Annuler l'invitation" });
  const invite = page.getByRole("button", { name: "Inviter mon partenaire" });
  await expect(leave.or(revoke).or(invite).first()).toBeVisible();
  if (await leave.isVisible()) {
    await leave.click();
    await page.getByRole("dialog").getByRole("button", { name: "Quitter le duo" }).click();
    await expect(invite).toBeVisible();
  } else if (await revoke.isVisible()) {
    await revoke.click();
    await expect(invite).toBeVisible();
  }
}

test.describe("Invitation conservée à l'inscription (CM-103)", () => {
  test("un nouvel inscrit par un lien d'invitation finit l'onboarding sur la confirmation et rejoint le duo", async ({ page }) => {
    await ensureSolo(page, SEED_ACCOUNTS.solo);

    // --- Solo invite ---
    await page
      .getByRole("region", { name: "S'entraîner à deux" })
      .getByRole("button", { name: "Inviter mon partenaire" })
      .click();
    await expect(page).toHaveURL(/\/duo\/inviter$/);
    const code = await page.getByTestId("invite-code").getAttribute("data-code");
    expect(code).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
    const next = encodeURIComponent(`/duo/rejoindre?code=${code}`);

    try {
      // --- Invité sans compte : lien -> connexion -> « Créer un compte » ---
      await signOut(page);
      await page.goto(`/duo/rejoindre?code=${code}`);
      await expect(page).toHaveURL(new RegExp(`/login\\?next=${escapeRe(next)}$`));
      await page.getByRole("link", { name: "Créer un compte", exact: true }).click();
      await expect(page).toHaveURL(new RegExp(`/welcome\\?next=${escapeRe(next)}$`));
      await page.getByRole("link", { name: "Créer un compte avec un email" }).click();
      await expect(page).toHaveURL(new RegExp(`/signup\\?next=${escapeRe(next)}$`));
      await expect(page.getByRole("heading", { name: "Crée ton compte" })).toBeVisible();
      await page.getByLabel("Email").fill(uniqueEmail());
      await page.getByLabel("Mot de passe", { exact: true }).fill(PASSWORD);
      await page.getByRole("button", { name: "Continuer" }).click();

      // --- Onboarding : le lien d'invitation suit ---
      await expect(page).toHaveURL(new RegExp(`/onboarding\\?next=${escapeRe(next)}$`));
      await page.getByLabel("Prénom").fill("Nina");
      // Même couleur que Solo (orange) : le conflit se règle à la confirmation.
      await page.getByRole("radio", { name: "Orange" }).click();
      await page.getByRole("button", { name: "Continuer" }).click();

      await expect(page).toHaveURL(new RegExp(`/onboarding/seances\\?next=${escapeRe(next)}$`));
      await expect(page.getByRole("heading", { name: /Par quoi tu commences, Nina/ })).toBeVisible();
      await expect(page.getByRole("note", { name: "Invitation en attente" })).toBeVisible();
      // Les modèles restent proposés (facultatifs), comme pour un solo.
      await expect(page.getByRole("radio", { name: /Push · Pull · Jambes/ })).toBeVisible();
      await expect(page.getByRole("button", { name: "Passer pour l'instant" })).toBeVisible();
      await page.getByRole("button", { name: "Ajouter et c'est parti" }).click();

      // --- Fin de l'onboarding : écran de confirmation de l'invitation ---
      await expect(page).toHaveURL(new RegExp(`/duo/rejoindre/confirmer\\?code=${code}$`));
      await expect(
        page.getByRole("heading", { name: `${SEED_NAMES.solo} t'invite à s'entraîner en duo` }),
      ).toBeVisible();
      const picker = page.getByRole("radiogroup", { name: "Ta couleur dans le duo" });
      await expect(picker).toBeVisible();
      await picker.getByRole("radio", { name: "Violet" }).click();
      await page.getByRole("button", { name: "Rejoindre le duo" }).click();

      // --- En duo avec Solo ---
      await expect(page).toHaveURL(/\/dashboard$/);
      await expect(page.getByRole("heading", { name: /^Salut, Nina/ })).toBeVisible();
      await expect(page.getByRole("region", { name: "Cette semaine" })).toContainText(SEED_NAMES.solo);
      await page.goto("/profile");
      await expect(page.getByText(`En duo avec ${SEED_NAMES.solo}`)).toBeVisible();
      // Ses séances du modèle restent à elle.
      await page.goto("/seances");
      await expect(page.getByRole("region", { name: "Mes séances" })).toContainText("Push");
    } finally {
      // Solo quitte le duo : retour à l'état du seed.
      await ensureSolo(page, SEED_ACCOUNTS.solo);
    }

    // Solo, de nouveau seul : aucune couleur grisée dans « Mon profil ».
    const section = page.getByRole("region", { name: "Mon profil" });
    await section.getByRole("button", { name: "Modifier" }).click();
    const colors = section.getByRole("radiogroup", { name: "Ma couleur" });
    await expect(colors.getByRole("radio")).toHaveCount(6);
    for (const radio of await colors.getByRole("radio").all()) await expect(radio).toBeEnabled();
    await expect(section.getByText(/^Couleur d/)).toHaveCount(0);
  });
});

test.describe("Lien d'invitation après une inscription (CM-88, PR 7)", () => {
  test("un compte tout juste inscrit ouvre la confirmation sans perdre sa session", async ({ page }) => {
    await ensureSolo(page, SEED_ACCOUNTS.solo);
    await page
      .getByRole("region", { name: "S'entraîner à deux" })
      .getByRole("button", { name: "Inviter mon partenaire" })
      .click();
    await expect(page).toHaveURL(/\/duo\/inviter$/);
    const code = await page.getByTestId("invite-code").getAttribute("data-code");
    expect(code).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);

    try {
      // Inscription SANS lien d'invitation, puis onboarding.
      await signOut(page);
      await page.goto("/signup");
      await page.getByLabel("Email").fill(uniqueEmail());
      await page.getByLabel("Mot de passe", { exact: true }).fill(PASSWORD);
      await page.getByRole("button", { name: "Continuer" }).click();
      await expect(page).toHaveURL(/\/onboarding$/);
      await page.getByLabel("Prénom").fill("Noé");
      await page.getByRole("radio", { name: "Violet" }).click();
      await page.getByRole("button", { name: "Continuer" }).click();
      await expect(page).toHaveURL(/\/onboarding\/seances$/);
      await page.getByRole("button", { name: "Passer pour l'instant" }).click();
      await expect(page).toHaveURL(/\/dashboard$/);

      // Le « code verifier » PKCE laissé par l'inscription est bien là : sans
      // le correctif, le `?code=` ci-dessous fermerait la session.
      const before = await page.context().cookies();
      expect(before.some((c) => c.name.endsWith("-auth-token-code-verifier"))).toBe(true);

      // Lien de confirmation ouvert directement (premier chargement).
      await page.goto(`/duo/rejoindre/confirmer?code=${code}`);
      await expect(
        page.getByRole("heading", { name: `${SEED_NAMES.solo} t'invite à s'entraîner en duo` }),
      ).toBeVisible();
      await expect(page).toHaveURL(new RegExp(`/duo/rejoindre/confirmer\\?code=${code}$`));
      // Session toujours là : une page privée s'ouvre sans passer par /login.
      await page.goto("/profile");
      await expect(page).toHaveURL(/\/profile$/);
      await expect(page.getByRole("region", { name: "Mon profil" })).toContainText("Noé");
    } finally {
      // Solo annule son invitation : retour à l'état du seed.
      await ensureSolo(page, SEED_ACCOUNTS.solo);
    }
  });
});

test.describe("Couleur unique dans le duo (CM-103)", () => {
  test("Théo ne peut pas choisir la couleur de Lina", async ({ page }) => {
    await login(page, SEED_ACCOUNTS.toi.email, SEED_ACCOUNTS.toi.password);
    await page.goto("/profile");
    const section = page.getByRole("region", { name: "Mon profil" });
    await expect(section).toContainText("Cyan");
    await section.getByRole("button", { name: "Modifier" }).click();

    // Rose (Lina) : grisée, non sélectionnable, avec la mention.
    const colors = section.getByRole("radiogroup", { name: "Ma couleur" });
    const rose = colors.getByRole("radio", { name: `Rose, couleur de ${SEED_NAMES.elle}` });
    await expect(rose).toBeDisabled();
    await expect(rose).toHaveAttribute("aria-checked", "false");
    await expect(section.getByText(`Couleur de ${SEED_NAMES.elle}`)).toBeVisible();
    for (const name of ["Cyan", "Orange", "Violet", "Bleu", "Jaune"]) {
      await expect(colors.getByRole("radio", { name, exact: true })).toBeEnabled();
    }

    // L'écriture la refuse aussi (formulaire forcé à la main ; CM-88 : écrite
    // depuis le navigateur, contrôle dans lib/data/profile.ts).
    await section.locator('input[name="accent_color"]').evaluate((el) => {
      (el as HTMLInputElement).value = "#FF4F7E";
    });
    await section.getByRole("button", { name: "Enregistrer" }).click();
    await expect(section.getByRole("alert")).toContainText(
      `C’est la couleur de ${SEED_NAMES.elle}`,
    );

    // Rien n'a changé.
    await page.goto("/profile");
    await expect(page.getByRole("region", { name: "Mon profil" })).toContainText("Cyan");
  });
});

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
