import { test, expect, type Page } from "@playwright/test";
import {
  E2E_ACCOUNT,
  SEED_ACCOUNTS,
  SEED_NAMES,
  deleteSessionViaUi,
  guardWrites,
  logSet,
  login,
  SESSION_URL,
  seanceEditPath,
  sessionIdFromUrl,
  sessionPath,
} from "./helpers";

// CM-87 : duo optionnel. Solo invite, Duo2 rejoint par le lien (connexion
// au passage), les deux voient les séances du duo, puis Solo quitte et garde
// une copie. ÉCRIT en base (duos, invitations, séances types) : garde-fou
// obligatoire. Rejouable sur la même base : chaque parcours commence par remettre Solo et Duo2
// hors duo, par l'UI.

guardWrites();

type Account = { email: string; password: string };

/** Ferme la session courante (cookies effacés). */
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

test.describe("Duo optionnel (CM-87)", () => {
  test("Solo invite, Duo2 rejoint par le lien, puis Solo quitte avec une copie", async ({ page }) => {
    await ensureSolo(page, SEED_ACCOUNTS.duo2);
    await ensureSolo(page, SEED_ACCOUNTS.solo);

    // --- Solo : profil solo, invitation ---
    const duoCard = page.getByRole("region", { name: "S'entraîner à deux" });
    await expect(duoCard).toBeVisible();
    await expect(page.getByText("Tu t'entraînes en solo")).toBeVisible();
    await duoCard.getByRole("button", { name: "Inviter mon partenaire" }).click();
    await expect(page).toHaveURL(/\/duo\/inviter$/);
    await expect(page.getByRole("heading", { name: "Invite ton partenaire" })).toBeVisible();
    const code = await page.getByTestId("invite-code").getAttribute("data-code");
    expect(code).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
    await expect(page.getByText(/En attente/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Partager" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Copier le code" })).toBeVisible();

    await page.goto("/profile");
    await expect(page.getByRole("region", { name: "Invitation en attente" })).toBeVisible();
    // Invitation en attente : toujours solo (aucune comparaison).
    await page.goto("/seances");
    await expect(page.getByRole("region", { name: "Nos séances" })).toHaveCount(0);

    // --- Duo2 : lien d'invitation sans session -> connexion -> retour ---
    await signOut(page);
    await page.goto(`/duo/rejoindre?code=${code}`);
    await expect(page).toHaveURL(/\/login\?next=/);
    await page.getByLabel("Email").fill(SEED_ACCOUNTS.duo2.email);
    await page.getByLabel("Mot de passe").fill(SEED_ACCOUNTS.duo2.password);
    await page.getByRole("button", { name: "Se connecter" }).click();
    await expect(page).toHaveURL(new RegExp(`/duo/rejoindre\\?code=${code}$`));
    await expect(page.getByLabel("Code d'invitation")).toHaveValue(code!);
    await page.getByRole("button", { name: "Valider le code" }).click();

    await expect(page).toHaveURL(/\/duo\/rejoindre\/confirmer\?code=/);
    await expect(
      page.getByRole("heading", { name: `${SEED_NAMES.solo} t'invite à s'entraîner en duo` }),
    ).toBeVisible();
    const join = page.getByRole("button", { name: "Rejoindre le duo" });
    // Seed : Duo2 a la même couleur que Solo (orange). Rejoué sur la même
    // base, la couleur choisie au premier passage reste : plus de conflit.
    const picker = page.getByRole("radiogroup", { name: "Ta couleur dans le duo" });
    if (await picker.isVisible()) {
      await expect(page.getByText(/utilise déjà le orange/)).toBeVisible();
      await picker.getByRole("radio", { name: "Orange" }).click();
      await expect(join).toBeDisabled();
      await picker.getByRole("radio", { name: "Bleu" }).click();
      await expect(join).toBeEnabled();
    }
    await join.click();

    // --- Duo2 en duo : prénoms, couleurs, séances du duo ---
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByRole("heading", { name: `Salut, ${SEED_NAMES.duo2}` })).toBeVisible();
    const week = page.getByRole("region", { name: "Cette semaine" });
    await expect(week).toContainText(SEED_NAMES.duo2);
    await expect(week).toContainText(SEED_NAMES.solo);
    await page.goto("/seances");
    await expect(page.getByRole("region", { name: "Nos séances" })).toContainText("Full body");
    await expect(page.getByRole("region", { name: "Mes séances" })).toBeVisible();
    await page.goto("/profile");
    await expect(page.getByText(`En duo avec ${SEED_NAMES.solo}`)).toBeVisible();

    // --- Solo voit le duo, puis le quitte ---
    await signOut(page);
    await login(page, SEED_ACCOUNTS.solo.email, SEED_ACCOUNTS.solo.password);
    await expect(page.getByRole("region", { name: "Cette semaine" })).toContainText(SEED_NAMES.duo2);
    await page.goto("/seances");
    await expect(page.getByRole("region", { name: "Nos séances" })).toContainText("Full body");

    await page.goto("/profile");
    await page.getByRole("button", { name: "Quitter le duo" }).click();
    const sheet = page.getByRole("dialog", { name: new RegExp(`Quitter le duo avec ${SEED_NAMES.duo2}`) });
    await expect(sheet).toBeVisible();
    await expect(sheet).toContainText("Tu gardes toutes tes séances");
    await sheet.getByRole("button", { name: "Quitter le duo" }).click();
    await expect(page.getByRole("region", { name: "S'entraîner à deux" })).toBeVisible();

    // Copie perso des séances du duo, plus aucune section partagée.
    await page.goto("/seances");
    await expect(page.getByRole("heading", { name: "Mes séances", level: 1 })).toBeVisible();
    await expect(page.getByRole("region", { name: "Nos séances" })).toHaveCount(0);
    await expect(page.getByText("Full body").first()).toBeVisible();
    // Ses séances réalisées restent là.
    await page.goto("/history");
    await expect(
      page.locator(`a[href="${sessionPath("99999999-9999-9999-9999-000000000004")}"]`),
    ).toBeVisible();
    await expect(page.getByText(SEED_NAMES.duo2)).toHaveCount(0);
  });

  test("le choix « Pour qui ? » n'existe qu'en duo", async ({ page }) => {
    await login(page, E2E_ACCOUNT.email, E2E_ACCOUNT.password);
    await page.goto("/seances/new");
    const choice = page.getByRole("radiogroup", { name: "Pour qui ?" });
    await expect(choice.getByRole("radio", { name: "Pour nous deux" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    await choice.getByRole("radio", { name: "Pour moi" }).click();
    await expect(page.getByText(/visible par toi uniquement/)).toBeVisible();

    await signOut(page);
    await login(page, SEED_ACCOUNTS.solo.email, SEED_ACCOUNTS.solo.password);
    await page.goto("/seances/new");
    await expect(page.getByRole("button", { name: "+ Ajouter un exercice" }).first()).toBeVisible();
    await expect(page.getByRole("radiogroup", { name: "Pour qui ?" })).toHaveCount(0);
  });

  test("CM-88 : le Profil suit les actions du duo sans rechargement", async ({ page }) => {
    await ensureSolo(page, SEED_ACCOUNTS.solo);
    // Marqueur posé dans la page : il disparaîtrait à un rechargement complet.
    await page.evaluate(() => ((window as unknown as { cm88: number }).cm88 = 1));
    const marker = () => page.evaluate(() => (window as unknown as { cm88?: number }).cm88);

    // Invitation créée depuis le Profil, retour par la croix (navigation de
    // l'app) : le Profil la montre, sans ancien état « solo » en cache.
    await page
      .getByRole("region", { name: "S'entraîner à deux" })
      .getByRole("button", { name: "Inviter mon partenaire" })
      .click();
    await expect(page).toHaveURL(/\/duo\/inviter$/);
    await page.getByRole("link", { name: "Fermer" }).click();
    await expect(page).toHaveURL(/\/profile$/);
    await expect(page.getByRole("region", { name: "Invitation en attente" })).toBeVisible();

    // Annulée depuis l'écran d'invitation (page serveur) : le Profil revient
    // à « solo », sans ancien état « en attente » en cache.
    await page.getByRole("link", { name: "Partager l'invitation" }).click();
    await expect(page).toHaveURL(/\/duo\/inviter$/);
    await page.getByRole("button", { name: "Annuler l'invitation" }).click();
    await expect(page).toHaveURL(/\/profile$/);
    await expect(page.getByRole("region", { name: "S'entraîner à deux" })).toBeVisible();
    await expect(page.getByRole("region", { name: "Invitation en attente" })).toHaveCount(0);
    expect(await marker()).toBe(1);
  });
});

/** « Bas du corps », séance type du duo Théo / Lina (seed). */
const BAS_DU_CORPS = "55555555-5555-5555-5555-000000000002";

test.describe("Garder pour moi une séance que le partenaire utilise (CM-87, C1)", () => {
  test("copie perso pour Théo, la séance en cours de Lina reste ouvrable", async ({ page }) => {
    // Lina démarre « Bas du corps », valide une série et laisse la séance en cours.
    await login(page, SEED_ACCOUNTS.elle.email, SEED_ACCOUNTS.elle.password);
    await page
      .getByRole("button")
      .filter({ hasText: /\d+ exercices?/ })
      .filter({ hasText: "Bas du corps" })
      .first()
      .click();
    await expect(page).toHaveURL(SESSION_URL);
    const sessionId = sessionIdFromUrl(page.url());
    await logSet(page, { weight: "40", reps: "8" });

    try {
      // Théo garde « Bas du corps » pour lui depuis l'édition.
      await signOut(page);
      await login(page, SEED_ACCOUNTS.toi.email, SEED_ACCOUNTS.toi.password);
      await page.goto(seanceEditPath(BAS_DU_CORPS));
      const choice = page.getByRole("radiogroup", { name: "Pour qui ?" });
      await expect(choice.getByRole("radio", { name: new RegExp(`Partager avec ${SEED_NAMES.elle}`) }))
        .toHaveAttribute("aria-checked", "true");
      await choice.getByRole("radio", { name: "Garder pour moi" }).click();
      await page.getByRole("button", { name: /Enregistrer la séance/ }).click();

      await expect(page).toHaveURL(/\/seances\?info=/);
      await expect(page.getByRole("status")).toContainText("Une copie a été ajoutée");
      await expect(page.getByRole("region", { name: "Nos séances" })).toContainText("Bas du corps");
      const mine = page.getByRole("region", { name: "Mes séances" });
      await expect(mine).toContainText("Bas du corps");

      // Nettoyage : Théo supprime sa copie (jamais faite).
      await mine.getByRole("button", { name: "Supprimer", exact: true }).click();
      await mine.getByRole("button", { name: "Oui, supprimer" }).click();
      await expect(mine).not.toContainText("Bas du corps");
    } finally {
      // Lina rouvre sa séance en cours (toujours accessible), puis la supprime.
      await signOut(page);
      await login(page, SEED_ACCOUNTS.elle.email, SEED_ACCOUNTS.elle.password);
      await page.goto(sessionPath(sessionId));
      await expect(page.getByRole("button", { name: "Quitter la séance" })).toBeVisible();
      await deleteSessionViaUi(page, sessionId);
    }
  });

  test("enregistrer sans changer le choix ne déplace rien (C2)", async ({ page }) => {
    await login(page, SEED_ACCOUNTS.toi.email, SEED_ACCOUNTS.toi.password);
    await page.goto(seanceEditPath(BAS_DU_CORPS));
    await page.getByRole("button", { name: /Enregistrer la séance/ }).click();
    await expect(page).toHaveURL(/\/seances$/);
    await expect(page.getByRole("region", { name: "Nos séances" })).toContainText("Bas du corps");
    await expect(page.getByRole("region", { name: "Mes séances" })).not.toContainText("Bas du corps");
  });
});

test.describe("Prénoms et couleurs au lieu de « Toi » / « Elle » (CM-87)", () => {
  test("Théo et Lina voient leurs prénoms", async ({ page }) => {
    await login(page, SEED_ACCOUNTS.toi.email, SEED_ACCOUNTS.toi.password);
    await expect(page.getByRole("heading", { name: `Salut, ${SEED_NAMES.toi}` })).toBeVisible();
    const week = page.getByRole("region", { name: "Cette semaine" });
    await expect(week).toContainText(SEED_NAMES.toi);
    await expect(week).toContainText(SEED_NAMES.elle);
    await expect(page.getByText(/^(Toi|Elle)$/)).toHaveCount(0);

    await page.goto("/progress");
    await expect(page.getByRole("link", { name: SEED_NAMES.toi, exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: SEED_NAMES.elle, exact: true })).toBeVisible();

    await page.goto("/seances");
    await expect(page.getByRole("region", { name: "Nos séances" })).toContainText(
      `Partagées avec ${SEED_NAMES.elle}`,
    );

    await signOut(page);
    await login(page, SEED_ACCOUNTS.elle.email, SEED_ACCOUNTS.elle.password);
    await expect(page.getByRole("heading", { name: `Salut, ${SEED_NAMES.elle}` })).toBeVisible();
    await page.goto("/profile");
    await expect(page.getByText(`En duo avec ${SEED_NAMES.toi}`)).toBeVisible();
  });

  test("Solo ne voit aucune comparaison", async ({ page }) => {
    await login(page, SEED_ACCOUNTS.solo.email, SEED_ACCOUNTS.solo.password);
    await expect(page.getByRole("region", { name: "Cette semaine" })).toHaveCount(0);
    await page.goto("/progress");
    await expect(page.getByText("Duo · séries (semaine)")).toHaveCount(0);
  });
});

// CM-104 : raccourci « Partager avec [prénom] » sur les cartes de « Mes
// séances ». ÉCRIT en base : séances « Pour moi » de Théo au nom unique,
// supprimées par l'UI (depuis « Nos séances » une fois partagées).
test.describe("Raccourci « Partager avec … » (CM-104)", () => {
  async function addExercise(page: Page, name: string) {
    await page.getByRole("button", { name: "+ Ajouter un exercice" }).first().click();
    const sheet = page.getByRole("dialog", { name: "Ajouter un exercice" });
    await sheet.getByRole("searchbox", { name: "Rechercher un exercice" }).fill(name);
    await sheet.getByRole("button", { name: new RegExp(name) }).first().click();
    await expect(sheet).toHaveCount(0);
  }

  /** Crée une séance « Pour moi » d'un exercice, puis revient à la bibliothèque. */
  async function createPersonalSeance(page: Page, name: string) {
    await page.goto("/seances/new");
    await page
      .getByRole("radiogroup", { name: "Pour qui ?" })
      .getByRole("radio", { name: "Pour moi" })
      .click();
    await addExercise(page, "Développé couché barre");
    await page.getByRole("button", { name: "Modifier le nom de la séance" }).click();
    const input = page.getByRole("textbox", { name: "Nom de la séance" });
    await input.fill(name);
    await input.press("Enter");
    await page.getByRole("button", { name: /Enregistrer la séance/ }).click();
    await expect(page).toHaveURL(/\/seances$/);
  }

  /** Supprime par l'UI les cartes `name` de la section, s'il y en a (idempotent). */
  async function deleteCards(page: Page, section: "Mes séances" | "Nos séances", name: string) {
    await page.goto("/seances");
    const region = page.getByRole("region", { name: section });
    await expect(region).toBeVisible();
    const cards = region.locator("section").filter({ has: page.getByRole("heading", { name, exact: true }) });
    for (let n = await cards.count(); n > 0; n--) {
      const card = cards.first();
      await card.getByRole("button", { name: "Supprimer", exact: true }).click();
      await card.getByRole("button", { name: "Oui, supprimer" }).click();
      await expect(cards).toHaveCount(n - 1);
    }
  }

  test("en duo : confirmer puis la carte passe dans « Nos séances » sans rechargement", async ({ page }) => {
    const name = `E2E partage ${Date.now().toString(36)}`;
    await login(page, SEED_ACCOUNTS.toi.email, SEED_ACCOUNTS.toi.password);
    try {
      await createPersonalSeance(page, name);

      const mine = page.getByRole("region", { name: "Mes séances" });
      const ours = page.getByRole("region", { name: "Nos séances" });
      const card = mine.locator("section").filter({ hasText: name });
      // Pas d'action de partage sur les cartes de « Nos séances ».
      await expect(ours.getByRole("button", { name: "Dupliquer" }).first()).toBeVisible();
      await expect(ours.getByRole("button", { name: /^Partager avec/ })).toHaveCount(0);

      const rpc: string[] = [];
      page.on("request", (req) => {
        if (req.url().includes("/rest/v1/rpc/set_seance_shared")) rpc.push(req.url());
      });

      // Annuler : rien n'est envoyé.
      await card.getByRole("button", { name: `Partager avec ${SEED_NAMES.elle}` }).click();
      await expect(card).toContainText(`${SEED_NAMES.elle} pourra la voir, la lancer et la modifier.`);
      await card.getByRole("button", { name: "Annuler" }).click();
      expect(rpc).toHaveLength(0);

      await card.getByRole("button", { name: `Partager avec ${SEED_NAMES.elle}` }).click();
      await card.getByRole("button", { name: "Oui, partager" }).click();
      await expect(page.getByRole("status")).toContainText(`« ${name} » est maintenant dans « Nos séances »`);
      await expect(mine.locator("section").filter({ hasText: name })).toHaveCount(0);
      await expect(ours.locator("section").filter({ hasText: name })).toHaveCount(1);
      expect(rpc).toHaveLength(1);
    } finally {
      // Nettoyage (jamais faite), quelle que soit la section où elle a fini.
      await deleteCards(page, "Nos séances", name);
      await deleteCards(page, "Mes séances", name);
    }
  });

  test("nom déjà pris dans « Nos séances » : message clair, rien ne bouge", async ({ page }) => {
    // « Bas du corps » existe dans « Nos séances » (seed).
    await login(page, SEED_ACCOUNTS.toi.email, SEED_ACCOUNTS.toi.password);
    // Reste d'un passage interrompu : la copie perso est retirée d'abord.
    await deleteCards(page, "Mes séances", "Bas du corps");
    try {
      await createPersonalSeance(page, "Bas du corps");
      const mine = page.getByRole("region", { name: "Mes séances" });
      const card = mine.locator("section").filter({ hasText: "Bas du corps" });
      await card.getByRole("button", { name: `Partager avec ${SEED_NAMES.elle}` }).click();
      await card.getByRole("button", { name: "Oui, partager" }).click();
      await expect(card.getByRole("alert")).toContainText(
        "« Bas du corps » existe déjà dans « Nos séances ». Rien n'a été modifié",
      );
      await expect(card.getByRole("link", { name: "Modifier" })).toBeVisible();
      await expect(
        page.getByRole("region", { name: "Nos séances" }).locator("section").filter({ hasText: "Bas du corps" }),
      ).toHaveCount(1);
    } finally {
      await deleteCards(page, "Mes séances", "Bas du corps");
    }
  });

  test("sans duo : aucune action de partage sur les cartes", async ({ page }) => {
    await ensureSolo(page, SEED_ACCOUNTS.solo);
    await page.goto("/seances");
    await expect(page.getByRole("heading", { name: "Mes séances", level: 1 })).toBeVisible();
    // La bibliothèque de Solo n'est pas vide (seed) : le test ne passe pas à vide.
    await expect(page.getByRole("button", { name: "Dupliquer" }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /^Partager avec/ })).toHaveCount(0);
  });
});
