import { test, expect } from "@playwright/test";
import { signUpWithPassword } from "@/lib/actions/signup";

// CM-86 : sans SIGNUP_ENABLED, l'action d'inscription refuse AVANT tout appel
// à Supabase (un POST direct ne crée aucun compte). La CI e2e met
// SIGNUP_ENABLED=1 : cette garde n'est vérifiée qu'ici.

function form(): FormData {
  const f = new FormData();
  f.set("email", "camille@exemple.test");
  f.set("password", "motdepasse-solide");
  return f;
}

test.describe("Garde SIGNUP_ENABLED de signUpWithPassword", () => {
  let saved: string | undefined;
  test.beforeEach(() => {
    saved = process.env.SIGNUP_ENABLED;
  });
  test.afterEach(() => {
    if (saved === undefined) delete process.env.SIGNUP_ENABLED;
    else process.env.SIGNUP_ENABLED = saved;
  });

  for (const value of [undefined, "", "0", "false", "non"]) {
    test(`refuse avec SIGNUP_ENABLED=${JSON.stringify(value)}`, async () => {
      if (value === undefined) delete process.env.SIGNUP_ENABLED;
      else process.env.SIGNUP_ENABLED = value;
      // Sans variables Supabase dans l'environnement de test : si la garde
      // laissait passer, createAuthClient lèverait (requête hors contexte).
      await expect(signUpWithPassword({}, form())).resolves.toEqual({
        error: "Les inscriptions ouvriront bientôt.",
      });
    });
  }
});
