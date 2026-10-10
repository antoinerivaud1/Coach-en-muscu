import { test, expect } from "@playwright/test";
import { isPublicPath } from "@/lib/auth/publicPaths";

// CM-93 : pages légales et support consultables sans compte.

test.describe("isPublicPath (CM-93)", () => {
  test("pages légales et support : publiques", () => {
    for (const p of [
      "/legal",
      "/legal/",
      "/legal/confidentialite",
      "/legal/cgu",
      "/legal/mentions",
      "/support",
      "/support/",
    ]) {
      expect(isPublicPath(p), p).toBe(true);
    }
  });

  test("pages de l'app : non publiques", () => {
    for (const p of ["/", "/dashboard", "/profile", "/login", "/seances/123", "/history"]) {
      expect(isPublicPath(p), p).toBe(false);
    }
  });

  test("correspondance par segment, pas par préfixe brut", () => {
    for (const p of ["/legalese", "/legal-cgu", "/supports", "/support-admin", "/profile/legal", "/x/support"]) {
      expect(isPublicPath(p), p).toBe(false);
    }
  });

  test("valeurs vides ou non absolues : non publiques", () => {
    expect(isPublicPath("")).toBe(false);
    expect(isPublicPath(null)).toBe(false);
    expect(isPublicPath(undefined)).toBe(false);
    expect(isPublicPath("legal/cgu")).toBe(false);
  });
});
