import { test, expect } from "@playwright/test";
import {
  authErrorMessage,
  LEGACY_PROFILE_COOKIE,
  isUuid,
  resolveProfileId,
  safeNextPath,
  validateLoginInput,
  validatePasswordCreation,
} from "@/lib/auth/core";
import { hasSupabaseAuthCookie } from "@/lib/supabase/auth-config";

// Tests unitaires purs (CM-58) : aucun navigateur, aucun appel Supabase.

const A = "11111111-1111-1111-1111-111111111111";
const B = "22222222-2222-2222-2222-222222222222";

test.describe("resolveProfileId (CM-59 B : session seule)", () => {
  test("avec session : l'id de session est l'id de profil", () => {
    expect(resolveProfileId(A)).toBe(A);
    expect(resolveProfileId(B)).toBe(B);
  });

  test("sans session : personne", () => {
    expect(resolveProfileId(null)).toBeNull();
    expect(resolveProfileId(undefined)).toBeNull();
  });

  test("chaîne vide traitée comme absente", () => {
    expect(resolveProfileId("")).toBeNull();
  });
});

test.describe("safeNextPath (CM-58, open redirect)", () => {
  test("chemins internes acceptés", () => {
    expect(safeNextPath("/dashboard")).toBe("/dashboard");
    expect(safeNextPath("/sessions/abc?x=1")).toBe("/sessions/abc?x=1");
  });

  test("défaut si vide", () => {
    expect(safeNextPath(undefined)).toBe("/dashboard");
    expect(safeNextPath("")).toBe("/dashboard");
  });

  test("URL externes et variantes refusées", () => {
    for (const bad of [
      "https://evil.example",
      "//evil.example",
      "/\\evil.example",
      "\\\\evil.example",
      "javascript:alert(1)",
      "/\tevil",
      "/%0a",
      "evil.example/x",
    ]) {
      const out = safeNextPath(bad);
      expect(out === "/dashboard" || out === bad, bad).toBeTruthy();
      expect(out.startsWith("//")).toBeFalsy();
      expect(out.includes("\\")).toBeFalsy();
      expect(/^[a-z]+:/i.test(out)).toBeFalsy();
    }
    expect(safeNextPath("//evil.example")).toBe("/dashboard");
    expect(safeNextPath("https://evil.example")).toBe("/dashboard");
    expect(safeNextPath("/\\evil.example")).toBe("/dashboard");
  });

  test("pas de boucle vers /login", () => {
    expect(safeNextPath("/login")).toBe("/dashboard");
    expect(safeNextPath("/login?next=/x")).toBe("/dashboard");
  });
});

test.describe("validateLoginInput (CM-58)", () => {
  test("email normalisé (espaces, casse)", () => {
    const r = validateLoginInput({ email: "  Antoine@Exemple.FR ", password: "x" });
    expect(r).toEqual({ ok: true, email: "antoine@exemple.fr", password: "x" });
  });

  test("champs manquants : messages en français", () => {
    const r = validateLoginInput({ email: "", password: "" });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.email).toBe("Saisis ton email.");
      expect(r.errors.password).toBe("Saisis ton mot de passe.");
    }
  });

  test("email invalide", () => {
    const r = validateLoginInput({ email: "pas-un-email", password: "x" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.email).toBe("Cet email n'a pas l'air valide.");
  });
});

test.describe("validatePasswordCreation (CM-58)", () => {
  const ok = { email: "a@b.fr", password: "12345678", confirm: "12345678" };

  test("8 caractères minimum", () => {
    expect(validatePasswordCreation(ok).ok).toBe(true);
    const r = validatePasswordCreation({ ...ok, password: "1234567", confirm: "1234567" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.password).toBe("Au moins 8 caractères.");
  });

  test("confirmation différente", () => {
    const r = validatePasswordCreation({ ...ok, confirm: "12345679" });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.confirm).toBe("Les deux mots de passe ne correspondent pas.");
      expect(r.errors.password).toBeUndefined();
    }
  });

  test("plus de 72 octets refusé (limite bcrypt)", () => {
    const long = "é".repeat(37); // 74 octets
    const r = validatePasswordCreation({ ...ok, password: long, confirm: long });
    expect(r.ok).toBe(false);
  });

  test("le mot de passe n'est pas tronqué ni nettoyé", () => {
    const r = validatePasswordCreation({ ...ok, password: " espaces ok ", confirm: " espaces ok " });
    expect(r).toEqual({ ok: true, email: "a@b.fr", password: " espaces ok " });
  });

  test("email requis et valide", () => {
    const r = validatePasswordCreation({ ...ok, email: "" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.email).toBe("Saisis ton email.");
  });
});

test.describe("authErrorMessage (CM-58)", () => {
  test("codes Supabase traduits", () => {
    expect(authErrorMessage({ code: "invalid_credentials" })).toBe("Email ou mot de passe incorrect.");
    expect(authErrorMessage({ code: "email_exists" })).toBe(
      "Cet email est déjà utilisé par un autre compte.",
    );
    expect(authErrorMessage({ status: 429 })).toBe("Trop de tentatives. Réessaie dans quelques minutes.");
  });

  test("inconnu : message générique, aucun détail technique", () => {
    expect(authErrorMessage({ code: "unexpected_failure" })).toBe(
      "Une erreur est survenue. Réessaie dans un instant.",
    );
    expect(authErrorMessage(null)).toBe("Une erreur est survenue. Réessaie dans un instant.");
  });
});

test.describe("divers (CM-58)", () => {
  test("isUuid", () => {
    expect(isUuid(A)).toBe(true);
    expect(isUuid("1111")).toBe(false);
    expect(isUuid(null)).toBe(false);
  });

  test("ancien cookie du sélecteur", () => {
    expect(LEGACY_PROFILE_COOKIE).toBe("cm_profile");
  });

  test("hasSupabaseAuthCookie", () => {
    expect(hasSupabaseAuthCookie(["cm_profile"])).toBe(false);
    expect(hasSupabaseAuthCookie(["sb-abc-auth-token"])).toBe(true);
    expect(hasSupabaseAuthCookie(["sb-abc-auth-token.0", "sb-abc-auth-token.1"])).toBe(true);
  });
});
