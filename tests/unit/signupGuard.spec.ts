import { test, expect } from "@playwright/test";
import { SIGNUP_CLOSED_MESSAGE, signUpWithEmail, signupOpen } from "@/lib/data/auth";

// CM-86 / CM-88 (PR 7) : inscription fermée, l'écran refuse AVANT tout appel
// à Supabase. Depuis CM-88, ce n'est qu'un affichage
// (`NEXT_PUBLIC_SIGNUP_ENABLED`, gravée au build) : la vraie barrière est le
// réglage Supabase « Allow new users to sign up ». La CI e2e build avec
// NEXT_PUBLIC_SIGNUP_ENABLED=1 : cette garde n'est vérifiée qu'ici.

/** Client factice : tout appel à l'auth fait échouer le test. */
const forbidden = {
  auth: new Proxy(
    {},
    {
      get() {
        throw new Error("Supabase ne doit pas être appelé quand l'inscription est fermée");
      },
    },
  ),
} as unknown as Parameters<typeof signUpWithEmail>[0];

const input = { email: "camille@exemple.test", password: "motdepasse-solide", next: "" };

test.describe("Garde d'inscription de signUpWithEmail", () => {
  test("fermée : refus sans appel à Supabase", async () => {
    await expect(signUpWithEmail(forbidden, input, false)).resolves.toEqual({
      error: SIGNUP_CLOSED_MESSAGE,
    });
  });

  test("fermée par défaut (variable absente)", () => {
    // Les tests unitaires ne définissent pas NEXT_PUBLIC_SIGNUP_ENABLED.
    expect(process.env.NEXT_PUBLIC_SIGNUP_ENABLED ?? "").not.toMatch(/^\s*(1|true)\s*$/i);
    expect(signupOpen()).toBe(false);
  });

  test("ouverte : validation avant tout appel (email invalide, rien n'est envoyé)", async () => {
    await expect(
      signUpWithEmail(forbidden, { ...input, email: "pas-un-email" }, true),
    ).resolves.toEqual({
      fieldErrors: { email: "Cet email n'a pas l'air valide." },
      email: "pas-un-email",
    });
  });

  test("ouverte : succès vers l'onboarding, `next` conservé", async () => {
    const client = {
      auth: { signUp: async () => ({ data: { session: {} }, error: null }) },
    } as unknown as Parameters<typeof signUpWithEmail>[0];
    await expect(
      signUpWithEmail(client, { ...input, next: "/duo/rejoindre?code=K7QM4P" }, true),
    ).resolves.toEqual({
      redirectTo: "/onboarding?next=%2Fduo%2Frejoindre%3Fcode%3DK7QM4P",
    });
  });
});
