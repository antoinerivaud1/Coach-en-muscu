import { test, expect } from "@playwright/test";
import {
  DEFAULT_WEEKLY_GOAL,
  FIRST_NAME_MAX_LENGTH,
  ONBOARDED_STORAGE_KEY,
  clampWeeklyGoal,
  hasOnboardedMark,
  initialOf,
  isOnboardingExemptPath,
  isSignupEnabled,
  latchOnboardingGate,
  onboardingGateDecision,
  onboardingRedirectTarget,
  rememberOnboarded,
  parseWeeklyGoal,
  safeOnboardingExit,
  validateFirstName,
  validateIdentityInput,
  validateSignupInput,
} from "@/lib/onboarding";

// CM-86 : onboarding solo. Tests purs : aucun navigateur, aucune donnée.

const UID = "11111111-1111-1111-1111-111111111111";

test.describe("Drapeau d'inscription NEXT_PUBLIC_SIGNUP_ENABLED", () => {
  test("fermé par défaut, ouvert seulement par 1 ou true", () => {
    expect(isSignupEnabled(undefined)).toBe(false);
    expect(isSignupEnabled("")).toBe(false);
    expect(isSignupEnabled("0")).toBe(false);
    expect(isSignupEnabled("false")).toBe(false);
    expect(isSignupEnabled("oui")).toBe(false);
    expect(isSignupEnabled("1")).toBe(true);
    expect(isSignupEnabled("true")).toBe(true);
    expect(isSignupEnabled(" TRUE ")).toBe(true);
  });
});

test.describe("Prénom", () => {
  test("obligatoire, nettoyé, borné", () => {
    expect(validateFirstName("  Camille  ")).toEqual({ ok: true, value: "Camille" });
    expect(validateFirstName("Jean   Paul")).toEqual({ ok: true, value: "Jean Paul" });
    expect(validateFirstName("")).toMatchObject({ ok: false });
    expect(validateFirstName("   ")).toMatchObject({ ok: false });
    expect(validateFirstName(null)).toMatchObject({ ok: false });
    expect(validateFirstName("a".repeat(FIRST_NAME_MAX_LENGTH))).toMatchObject({ ok: true });
    expect(validateFirstName("a".repeat(FIRST_NAME_MAX_LENGTH + 1))).toMatchObject({ ok: false });
    expect(validateFirstName("Zoé\u0007")).toMatchObject({ ok: false });
  });

  test("initiale en capitale, accents gardés", () => {
    expect(initialOf("camille")).toBe("C");
    expect(initialOf("élodie")).toBe("É");
    expect(initialOf("  ")).toBe("?");
  });
});

test.describe("Objectif hebdo (1 à 7, 3 par défaut)", () => {
  test("parseWeeklyGoal", () => {
    expect(DEFAULT_WEEKLY_GOAL).toBe(3);
    expect(parseWeeklyGoal("1")).toBe(1);
    expect(parseWeeklyGoal(7)).toBe(7);
    expect(parseWeeklyGoal("0")).toBeNull();
    expect(parseWeeklyGoal("8")).toBeNull();
    expect(parseWeeklyGoal("3.5")).toBeNull();
    expect(parseWeeklyGoal("")).toBeNull();
    expect(parseWeeklyGoal("abc")).toBeNull();
  });

  test("clampWeeklyGoal", () => {
    expect(clampWeeklyGoal(0)).toBe(1);
    expect(clampWeeklyGoal(9)).toBe(7);
    expect(clampWeeklyGoal(4)).toBe(4);
    expect(clampWeeklyGoal(Number.NaN)).toBe(3);
  });
});

test.describe("validateIdentityInput", () => {
  test("valide : prénom, une des 6 couleurs, objectif", () => {
    expect(
      validateIdentityInput({ displayName: " Camille ", accentColor: "#FF8A3D", weeklyGoal: "4" }),
    ).toEqual({
      ok: true,
      value: { displayName: "Camille", accentColor: "#FF8A3D", weeklyGoal: 4 },
    });
  });

  test("refuse le vert acide de l'interface et une couleur inconnue", () => {
    for (const accentColor of ["#CCFF02", "#2fe6ff", "red", ""]) {
      const r = validateIdentityInput({ displayName: "Camille", accentColor, weeklyGoal: 3 });
      expect(r.ok, accentColor).toBe(false);
      if (!r.ok) expect(r.errors.accentColor).toBeTruthy();
    }
  });

  test("toutes les erreurs à la fois", () => {
    const r = validateIdentityInput({ displayName: "", accentColor: "x", weeklyGoal: "12" });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(Object.keys(r.errors).sort()).toEqual(["accentColor", "displayName", "weeklyGoal"]);
    }
  });
});

test.describe("validateSignupInput", () => {
  test("email normalisé, mot de passe de 8 caractères au moins", () => {
    expect(validateSignupInput({ email: " Camille@Exemple.FR ", password: "motdepasse" })).toEqual({
      ok: true,
      email: "camille@exemple.fr",
      password: "motdepasse",
    });
    const r = validateSignupInput({ email: "pas-un-email", password: "court" });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.email).toBeTruthy();
      expect(r.errors.password).toContain("8");
    }
    expect(validateSignupInput({ email: "", password: "" }).ok).toBe(false);
  });
});

test.describe("Redirection vers /onboarding", () => {
  test("un compte pas encore onboardé est envoyé vers /onboarding", () => {
    for (const path of ["/", "/dashboard", "/profile", "/seances/new", "/sessions/abc", "/history"]) {
      expect(onboardingRedirectTarget(path, "pending"), path).toBe("/onboarding");
    }
  });

  test("jamais depuis l'onboarding, la connexion, l'accueil public, le légal ou l'API", () => {
    for (const path of [
      "/onboarding",
      "/onboarding/seances",
      "/login",
      "/signup",
      "/welcome",
      "/legal/cgu",
      "/support",
      "/api/x",
    ]) {
      expect(isOnboardingExemptPath(path), path).toBe(true);
      expect(onboardingRedirectTarget(path, "pending"), path).toBeNull();
    }
    expect(isOnboardingExemptPath("/onboardingx")).toBe(false);
    expect(isOnboardingExemptPath("/apix")).toBe(false);
  });

  test("un compte onboardé (Antoine, Léa) ou un état inconnu n'est jamais redirigé", () => {
    for (const path of ["/", "/dashboard", "/profile"]) {
      expect(onboardingRedirectTarget(path, "done")).toBeNull();
      expect(onboardingRedirectTarget(path, "unknown")).toBeNull();
    }
  });

  test("sorties de fin d'onboarding : liste fermée", () => {
    expect(safeOnboardingExit("/seances/new")).toBe("/seances/new");
    expect(safeOnboardingExit("/dashboard")).toBe("/dashboard");
    expect(safeOnboardingExit("https://evil.example")).toBe("/dashboard");
    expect(safeOnboardingExit("//evil")).toBe("/dashboard");
    expect(safeOnboardingExit(undefined)).toBe("/dashboard");
  });
});

// CM-89 (PR 1) : la redirection est faite dans le navigateur (OnboardingGate).
test.describe("OnboardingGate : décision (CM-89)", () => {
  const base = {
    pathname: "/dashboard",
    session: "signedIn",
    remembered: false,
    state: "loading",
  } as const;

  test("chemin exempté : affiché tout de suite, sans attendre la session", () => {
    for (const pathname of ["/onboarding", "/login", "/welcome", "/legal/cgu", "/support"]) {
      expect(onboardingGateDecision({ ...base, pathname, session: "pending" }), pathname).toEqual({
        kind: "render",
      });
    }
  });

  test("session ou onboarding pas encore connus : squelette, jamais l'écran", () => {
    expect(onboardingGateDecision({ ...base, session: "pending" })).toEqual({ kind: "wait" });
    expect(onboardingGateDecision(base)).toEqual({ kind: "wait" });
    expect(onboardingGateDecision({ ...base, pathname: "/" })).toEqual({ kind: "wait" });
  });

  test("pas onboardé : redirection, lien d'invitation conservé", () => {
    expect(onboardingGateDecision({ ...base, state: "pending" })).toEqual({
      kind: "redirect",
      to: "/onboarding",
    });
    expect(
      onboardingGateDecision({
        ...base,
        pathname: "/duo/rejoindre",
        search: "?code=K7QM4P",
        state: "pending",
      }),
    ).toEqual({
      kind: "redirect",
      to: `/onboarding?next=${encodeURIComponent("/duo/rejoindre?code=K7QM4P")}`,
    });
  });

  test("onboardé (lu ou mémorisé), état inconnu, sans session ou erreur : écran affiché", () => {
    expect(onboardingGateDecision({ ...base, state: "done" })).toEqual({ kind: "render" });
    expect(onboardingGateDecision({ ...base, state: "unknown" })).toEqual({ kind: "render" });
    // Mémo de l'appareil : pas d'attente de la lecture du profil.
    expect(onboardingGateDecision({ ...base, remembered: true })).toEqual({ kind: "render" });
    // Les écrans renvoient eux-mêmes vers /login, ou proposent « Réessayer ».
    expect(onboardingGateDecision({ ...base, session: "signedOut" })).toEqual({ kind: "render" });
    expect(onboardingGateDecision({ ...base, session: "error" })).toEqual({ kind: "render" });
  });
});

test.describe("OnboardingGate : écran déjà affiché (CM-89)", () => {
  const OTHER = "22222222-2222-2222-2222-222222222222";
  const here = { pathname: "/sessions/abc", userId: UID };
  const wait = { kind: "wait" } as const;
  const render = { kind: "render" } as const;

  test("premier affichage : verrou posé pour ce chemin et ce compte", () => {
    expect(latchOnboardingGate(render, null, here)).toEqual({
      decision: render,
      latch: { pathname: "/sessions/abc", userId: UID },
    });
    // Sans verrou, un `wait` reste un squelette.
    expect(latchOnboardingGate(wait, null, here).decision).toEqual(wait);
  });

  test("session perdue en pleine séance : l'écran reste, jamais le squelette", () => {
    const latch = { pathname: "/sessions/abc", userId: UID };
    // Cache relu après SIGNED_OUT : session « en cours de lecture ».
    const pending = latchOnboardingGate(wait, latch, { ...here, userId: null });
    expect(pending).toEqual({ decision: render, latch });
    // Puis « personne » : écran affiché, le dernier compte connu est gardé.
    const out = latchOnboardingGate(render, pending.latch, { ...here, userId: null });
    expect(out.latch).toEqual(latch);
    // Reconnexion du même compte : rien n'est revérifié.
    expect(latchOnboardingGate(wait, out.latch, here).decision).toEqual(render);
  });

  test("un autre compte ou un autre chemin : vérification relancée", () => {
    const latch = { pathname: "/sessions/abc", userId: UID };
    expect(latchOnboardingGate(wait, latch, { ...here, userId: OTHER })).toEqual({
      decision: wait,
      latch: null,
    });
    expect(latchOnboardingGate(wait, latch, { ...here, pathname: "/dashboard" })).toEqual({
      decision: wait,
      latch: null,
    });
    // Écran d'abord affiché sans session, puis un compte se connecte.
    expect(
      latchOnboardingGate(wait, { pathname: "/sessions/abc", userId: null }, here).decision,
    ).toEqual(wait);
  });

  test("une redirection s'applique toujours, même écran déjà affiché", () => {
    const latch = { pathname: "/sessions/abc", userId: UID };
    const redirect = { kind: "redirect", to: "/onboarding" } as const;
    expect(latchOnboardingGate(redirect, latch, here).decision).toEqual(redirect);
  });
});

test.describe("Mémo « onboarding fait » de l'appareil (CM-89)", () => {
  function fakeStorage(initial: Record<string, string> = {}) {
    const data = new Map(Object.entries(initial));
    return {
      data,
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => void data.set(k, v),
    };
  }

  test("ne vaut que pour son compte", () => {
    const storage = fakeStorage({ [ONBOARDED_STORAGE_KEY]: UID });
    expect(hasOnboardedMark(UID, storage)).toBe(true);
    expect(hasOnboardedMark("22222222-2222-2222-2222-222222222222", storage)).toBe(false);
    expect(hasOnboardedMark(UID, fakeStorage())).toBe(false);
    expect(hasOnboardedMark(UID, fakeStorage({ [ONBOARDED_STORAGE_KEY]: "" }))).toBe(false);
  });

  test("posé pour un compte, remplacé par le suivant", () => {
    const storage = fakeStorage();
    rememberOnboarded(UID, storage);
    expect(storage.data.get(ONBOARDED_STORAGE_KEY)).toBe(UID);
    rememberOnboarded("22222222-2222-2222-2222-222222222222", storage);
    expect(hasOnboardedMark(UID, storage)).toBe(false);
  });

  test("stockage absent ou qui lève (navigation privée) : jamais d'exception", () => {
    const throwing = {
      getItem: () => {
        throw new Error("SecurityError");
      },
      setItem: () => {
        throw new Error("QuotaExceededError");
      },
    };
    expect(hasOnboardedMark(UID, throwing)).toBe(false);
    expect(() => rememberOnboarded(UID, throwing)).not.toThrow();
    expect(hasOnboardedMark(UID, null)).toBe(false);
    expect(() => rememberOnboarded(UID, null)).not.toThrow();
    // Hors navigateur (tests, rendu serveur) : pas de `window`, rien n'est lu.
    expect(hasOnboardedMark(UID)).toBe(false);
  });
});
