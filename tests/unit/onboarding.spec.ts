import { test, expect } from "@playwright/test";
import {
  DEFAULT_WEEKLY_GOAL,
  FIRST_NAME_MAX_LENGTH,
  clampWeeklyGoal,
  initialOf,
  isOnboardingExemptPath,
  isSignupEnabled,
  onboardedCookieMatches,
  onboardingRedirectTarget,
  parseWeeklyGoal,
  safeOnboardingExit,
  validateFirstName,
  validateIdentityInput,
  validateSignupInput,
} from "@/lib/onboarding";

// CM-86 : onboarding solo. Tests purs : aucun navigateur, aucune donnée.

const UID = "11111111-1111-1111-1111-111111111111";

test.describe("Drapeau d'inscription SIGNUP_ENABLED", () => {
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

  test("le cookie de confort ne vaut que pour son compte", () => {
    expect(onboardedCookieMatches(UID, UID)).toBe(true);
    expect(onboardedCookieMatches("22222222-2222-2222-2222-222222222222", UID)).toBe(false);
    expect(onboardedCookieMatches(undefined, UID)).toBe(false);
    expect(onboardedCookieMatches("", UID)).toBe(false);
  });

  test("sorties de fin d'onboarding : liste fermée", () => {
    expect(safeOnboardingExit("/seances/new")).toBe("/seances/new");
    expect(safeOnboardingExit("/dashboard")).toBe("/dashboard");
    expect(safeOnboardingExit("https://evil.example")).toBe("/dashboard");
    expect(safeOnboardingExit("//evil")).toBe("/dashboard");
    expect(safeOnboardingExit(undefined)).toBe("/dashboard");
  });
});
