import { test, expect } from "@playwright/test";
import { loginPath, readNextParam, safeNextPath, withNext } from "@/lib/auth/core";
import {
  invitationCodeFromPath,
  onboardingDestination,
  onboardingRedirectTarget,
} from "@/lib/onboarding";

// CM-103 : invitation conservée à l'inscription. Un invité sans compte ouvre
// `/duo/rejoindre?code=…`, passe par `/login?next=…`, choisit « Créer un
// compte » : le `next` suit /welcome -> /signup -> /onboarding ->
// /onboarding/seances, puis la fin de l'onboarding mène à la confirmation.
// Tests purs : aucun navigateur, aucune donnée.

const CODE = "K7QM4P";
const JOIN = `/duo/rejoindre?code=${CODE}`;
const CONFIRM = `/duo/rejoindre/confirmer?code=${CODE}`;
const ENC = encodeURIComponent(JOIN);

test.describe("readNextParam / withNext (CM-103)", () => {
  test("le lien d'invitation est transporté tel quel, encodé", () => {
    expect(readNextParam(JOIN)).toBe(JOIN);
    expect(readNextParam([JOIN, "/autre"])).toBe(JOIN);
    expect(withNext("/welcome", JOIN)).toBe(`/welcome?next=${ENC}`);
    expect(withNext("/signup", JOIN)).toBe(`/signup?next=${ENC}`);
    expect(withNext("/onboarding", JOIN)).toBe(`/onboarding?next=${ENC}`);
    // Chemin qui porte déjà une query : `&next=`.
    expect(withNext("/onboarding/seances?error=x", JOIN)).toBe(
      `/onboarding/seances?error=x&next=${ENC}`,
    );
  });

  test("aller-retour : ce que withNext écrit, readNextParam le relit", () => {
    const url = new URL(withNext("/signup", JOIN), "http://x");
    expect(readNextParam(url.searchParams.get("next"))).toBe(JOIN);
    expect(loginPath(JOIN)).toBe(`/login?next=${ENC}`);
  });

  test("next absent ou dangereux : rien n'est transporté", () => {
    for (const bad of [
      undefined,
      null,
      "",
      "https://evil.example/duo/rejoindre?code=K7QM4P",
      "//evil.example",
      "/\\evil.example",
      "javascript:alert(1)",
      "/login?next=/x",
    ]) {
      expect(readNextParam(bad), String(bad)).toBe("");
      expect(withNext("/welcome", bad), String(bad)).toBe("/welcome");
    }
  });

  test("safeNextPath garde son défaut (/dashboard) pour la connexion", () => {
    expect(safeNextPath(readNextParam(undefined))).toBe("/dashboard");
    expect(safeNextPath(readNextParam(JOIN))).toBe(JOIN);
  });
});

test.describe("invitationCodeFromPath (CM-103)", () => {
  test("lien de saisie ou de confirmation avec un code complet", () => {
    expect(invitationCodeFromPath(JOIN)).toBe(CODE);
    expect(invitationCodeFromPath(CONFIRM)).toBe(CODE);
    expect(invitationCodeFromPath("/duo/rejoindre?code=k7q-m4p")).toBe(CODE);
  });

  test("autre chemin, code incomplet ou URL externe : null", () => {
    expect(invitationCodeFromPath("/duo/rejoindre")).toBeNull();
    expect(invitationCodeFromPath("/duo/rejoindre?code=ABC")).toBeNull();
    expect(invitationCodeFromPath("/duo/inviter?code=K7QM4P")).toBeNull();
    expect(invitationCodeFromPath("/profile")).toBeNull();
    expect(invitationCodeFromPath("https://evil.example/duo/rejoindre?code=K7QM4P")).toBeNull();
    expect(invitationCodeFromPath("")).toBeNull();
    expect(invitationCodeFromPath(null)).toBeNull();
  });
});

test.describe("onboardingDestination (CM-103)", () => {
  test("invitation conservée : fin sur l'écran de CONFIRMATION", () => {
    for (const exit of ["/dashboard", "/seances/new", "", undefined]) {
      expect(onboardingDestination(exit, JOIN), String(exit)).toBe(CONFIRM);
    }
    expect(onboardingDestination("/dashboard", CONFIRM)).toBe(CONFIRM);
  });

  test("autre next sûr : on y retourne", () => {
    expect(onboardingDestination("/dashboard", "/profile")).toBe("/profile");
  });

  test("sans next (solo) : la sortie choisie, comme avant", () => {
    expect(onboardingDestination("/dashboard", "")).toBe("/dashboard");
    expect(onboardingDestination("/seances/new", undefined)).toBe("/seances/new");
    expect(onboardingDestination("https://evil.example", "")).toBe("/dashboard");
  });

  test("next dangereux ou étape d'onboarding : ignoré", () => {
    for (const bad of ["//evil", "https://evil.example", "/onboarding", "/onboarding/seances", "/signup", "/welcome?next=/x"]) {
      expect(onboardingDestination("/dashboard", bad), bad).toBe("/dashboard");
    }
  });
});

test.describe("Redirection vers /onboarding avec une invitation (CM-103)", () => {
  test("lien d'invitation ouvert avant la fin de l'onboarding : conservé en next", () => {
    expect(onboardingRedirectTarget("/duo/rejoindre", "pending", `?code=${CODE}`)).toBe(
      `/onboarding?next=${ENC}`,
    );
    expect(onboardingRedirectTarget("/duo/rejoindre/confirmer", "pending", `?code=${CODE}`)).toBe(
      `/onboarding?next=${ENC}`,
    );
  });

  test("sans code valide ou autre page : /onboarding tout court", () => {
    expect(onboardingRedirectTarget("/duo/rejoindre", "pending")).toBe("/onboarding");
    expect(onboardingRedirectTarget("/duo/rejoindre", "pending", "?code=AB")).toBe("/onboarding");
    expect(onboardingRedirectTarget("/profile", "pending", `?code=${CODE}`)).toBe("/onboarding");
    expect(onboardingRedirectTarget("/duo/rejoindre", "done", `?code=${CODE}`)).toBeNull();
  });
});
