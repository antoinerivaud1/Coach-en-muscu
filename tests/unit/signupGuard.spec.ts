import { test, expect } from "@playwright/test";
import { SIGNUP_CLOSED_MESSAGE, signOutLocal, signUpWithEmail, signupOpen } from "@/lib/data/auth";
import { clearSessionCookies } from "@/lib/supabase/nativeSession";

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

// CM-88 (PR 7) : la déconnexion aboutit toujours, même si Supabase échoue.
test.describe("signOutLocal", () => {
  /** Faux `document.cookie` : lecture de la liste, écriture = effacement. */
  function fakeDoc(names: string[]) {
    const jar = new Set(names);
    const written: string[] = [];
    return {
      jar,
      written,
      get cookie() {
        return [...jar].map((n) => `${n}=v`).join("; ");
      },
      set cookie(value: string) {
        written.push(value);
        const name = value.split("=")[0]!;
        if (/max-age=0/i.test(value)) jar.delete(name);
      },
    };
  }
  /** Effacement web (cookies), comme `clearLocalSession` hors app native. */
  const wipe = (doc: { cookie: string }) => () => {
    clearSessionCookies(doc);
  };
  const session = ["sb-127-auth-token.0", "sb-127-auth-token.1", "cm_onboarded", "autre"];
  type Client = Parameters<typeof signOutLocal>[0];
  const client = (signOut: () => Promise<{ error: unknown }>) =>
    ({ auth: { signOut } }) as unknown as Client;

  test("succès : Supabase a fermé la session, aucun cookie touché ici", async () => {
    const doc = fakeDoc(session);
    expect(await signOutLocal(client(async () => ({ error: null })), wipe(doc))).toBe(false);
    expect(doc.written).toEqual([]);
  });

  test("erreur renvoyée (réseau) : cookies de session effacés, les autres gardés", async () => {
    const doc = fakeDoc(session);
    const failing = client(async () => ({ error: { name: "AuthRetryableFetchError" } }));
    expect(await signOutLocal(failing, wipe(doc))).toBe(true);
    expect([...doc.jar].sort()).toEqual(["autre", "cm_onboarded"]);
  });

  test("exception : cookies de session effacés", async () => {
    const doc = fakeDoc(session);
    const throwing = client(async () => {
      throw new Error("réseau");
    });
    expect(await signOutLocal(throwing, wipe(doc))).toBe(true);
    expect(doc.jar.has("sb-127-auth-token.0")).toBe(false);
  });

  test("pas de réponse : cookies effacés après le délai", async () => {
    const doc = fakeDoc(session);
    const hanging = client(() => new Promise(() => {}));
    expect(await signOutLocal(hanging, wipe(doc), 20)).toBe(true);
    expect(doc.jar.has("sb-127-auth-token.1")).toBe(false);
  });

  // CM-89 (PR 4) : dans l'app native, l'effacement vise Preferences. Une
  // erreur du stockage ne doit jamais bloquer la déconnexion.
  test("effacement en erreur : la déconnexion aboutit quand même", async () => {
    const failing = client(async () => ({ error: { name: "AuthRetryableFetchError" } }));
    const broken = async () => {
      throw new Error("stockage indisponible");
    };
    expect(await signOutLocal(failing, broken)).toBe(true);
  });
});

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
