import { test, expect } from "@playwright/test";
import { SEED_ACCOUNTS, SEED_NAMES, guardWrites, login } from "./helpers";

// CM-59 B : isolation par la RLS, sous le vrai client utilisateur. Ne crée
// rien, mais le tableau de bord purge les séances vides abandonnées (CM-83) :
// garde-fou obligatoire. Données de supabase/seed.sql.

/** Séance terminée de « Toi » (duo), séance type « Haut du corps ». */
const TOI_SESSION = "77777777-7777-7777-7777-000000000001";
/** Séance terminée de « Solo » (hors duo), séance type « Full body ». */
const SOLO_SESSION = "99999999-9999-9999-9999-000000000004";

guardWrites();

test.describe("Isolation des données (RLS, CM-59)", () => {
  test("Solo n'ouvre pas une séance du duo", async ({ page }) => {
    await login(page, SEED_ACCOUNTS.solo.email, SEED_ACCOUNTS.solo.password);
    const res = await page.goto(`/sessions/${TOI_SESSION}`);
    // 404, ou toute redirection hors de la séance : jamais la séance elle-même.
    if (res?.status() !== 404) {
      expect(page.url()).not.toContain(TOI_SESSION);
    }
    await expect(page.getByText("Séance de test (seed)")).toHaveCount(0);
    await expect(page.getByText("Développé couché barre")).toHaveCount(0);
    await expect(page.getByText("Volume total")).toHaveCount(0);
  });

  test("le tableau de bord et l'historique de Solo ne montrent rien du duo", async ({ page }) => {
    await login(page, SEED_ACCOUNTS.solo.email, SEED_ACCOUNTS.solo.password);
    // Témoin : la séance type de Solo est bien là.
    await expect(page.getByText("Full body").first()).toBeVisible();
    // Programme du duo (« Nos séances ») : aucune de ses séances types.
    await expect(page.getByText("Haut du corps")).toHaveCount(0);
    await expect(page.getByText("Bas du corps")).toHaveCount(0);

    await page.goto("/history");
    await expect(page.locator(`a[href="/sessions/${SOLO_SESSION}"]`)).toBeVisible();
    await expect(page.locator(`a[href="/sessions/${TOI_SESSION}"]`)).toHaveCount(0);
    await expect(page.getByText("Haut du corps")).toHaveCount(0);
  });

  test("le duo n'ouvre pas une séance de Solo", async ({ page }) => {
    await login(page, SEED_ACCOUNTS.toi.email, SEED_ACCOUNTS.toi.password);
    const res = await page.goto(`/sessions/${SOLO_SESSION}`);
    if (res?.status() !== 404) {
      expect(page.url()).not.toContain(SOLO_SESSION);
    }
    await expect(page.getByText("Séance solo (seed)")).toHaveCount(0);
    await expect(page.getByText("Full body")).toHaveCount(0);
  });

  test("Elle voit l'historique de son partenaire (visible_profile_ids)", async ({ page }) => {
    await login(page, SEED_ACCOUNTS.elle.email, SEED_ACCOUNTS.elle.password);
    await page.goto("/history");
    const toiSession = page.locator(`a[href="/sessions/${TOI_SESSION}"]`);
    await expect(toiSession).toBeVisible();
    await expect(toiSession).toContainText("Haut du corps");
    // CM-87 : prénom du membre (seed : « Théo »), plus jamais « Toi ».
    await expect(toiSession).toContainText(SEED_NAMES.toi);
    await expect(toiSession).not.toContainText(/\bToi\b/);
    await expect(page.locator(`a[href="/sessions/${SOLO_SESSION}"]`)).toHaveCount(0);
  });
});
