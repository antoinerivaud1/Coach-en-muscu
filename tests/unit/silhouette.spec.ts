import { test, expect } from "@playwright/test";
import {
  defaultSilhouette,
  parseSilhouette,
  resolveSilhouette,
} from "@/lib/silhouette";
import { zoneRole, zoneRoles, zonesFor } from "@/lib/bodyMap";
import { FEMALE_FIGURE, MALE_FIGURE } from "@/lib/bodyMapPaths";
import { EXERCISE_MUSCLES } from "@/lib/exerciseMuscles";

// Tests unitaires purs (CM-30) : silhouette par défaut et coloration.
// Lancer : npm run test:unit

test.describe("Silhouette par défaut (CM-30)", () => {
  test("déduite du rôle couleur du profil actif", () => {
    expect(defaultSilhouette("elle")).toBe("femme");
    expect(defaultSilhouette("toi")).toBe("homme");
  });

  test("rien de déductible : homme", () => {
    expect(defaultSilhouette(null)).toBe("homme");
    expect(defaultSilhouette(undefined)).toBe("homme");
  });

  test("le choix mémorisé l'emporte sur le profil", () => {
    expect(resolveSilhouette("homme", "elle")).toBe("homme");
    expect(resolveSilhouette("femme", "toi")).toBe("femme");
    expect(resolveSilhouette("femme", undefined)).toBe("femme");
  });

  test("une valeur mémorisée invalide est ignorée", () => {
    expect(parseSilhouette("toi")).toBeNull();
    expect(parseSilhouette(null)).toBeNull();
    expect(resolveSilhouette("elle", "elle")).toBe("femme");
    expect(resolveSilhouette("n'importe quoi", "toi")).toBe("homme");
  });
});

test.describe("Coloration des silhouettes (CM-30)", () => {
  test("deltoïdes : antérieurs sur la face, postérieurs sur le dos", () => {
    expect(zonesFor("front-deltoids", "front")).toEqual(["deltoids"]);
    expect(zonesFor("front-deltoids", "back")).toEqual([]);
    expect(zonesFor("back-deltoids", "back")).toEqual(["deltoids"]);
    expect(zonesFor("back-deltoids", "front")).toEqual([]);
  });

  test("le principal l'emporte sur le secondaire", () => {
    const roles = zoneRoles({ primary: ["chest"], secondary: ["chest", "triceps"] }, "front");
    expect(zoneRole("chest", roles)).toBe("primary");
    expect(zoneRole("triceps", roles)).toBe("secondary");
    expect(zoneRole("abs", roles)).toBe("idle");
    expect(zoneRole("head", roles)).toBe("base");
  });

  test("chaque muscle du catalogue est visible sur les deux silhouettes", () => {
    for (const figure of [MALE_FIGURE, FEMALE_FIGURE]) {
      const zones = new Set([...figure.front, ...figure.back].map(([slug]) => slug));
      for (const [name, m] of Object.entries(EXERCISE_MUSCLES)) {
        for (const muscle of [...m.primary, ...m.secondary]) {
          const mapped = [...zonesFor(muscle, "front"), ...zonesFor(muscle, "back")];
          expect(mapped.some((z) => zones.has(z)), `${name} / ${muscle}`).toBe(true);
        }
      }
    }
  });
});
