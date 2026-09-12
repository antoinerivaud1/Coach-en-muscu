import { test, expect } from "@playwright/test";
import {
  SEANCE_NAME_MAX_LENGTH,
  validateSeanceName,
} from "@/lib/utils/seances";

// Tests unitaires purs (CM-67) : aucun navigateur, aucune donnée Supabase.
// Lancer : npm run test:unit

test.describe("validateSeanceName (CM-80)", () => {
  test("accepte un nom simple et renvoie la version trimée", () => {
    const result = validateSeanceName("  Jambes  ", ["Dos", "Pec"]);
    expect(result).toEqual({ ok: true, name: "Jambes" });
  });

  test("refuse un nom vide ou fait uniquement d'espaces", () => {
    for (const raw of ["", "   ", "\t\n"]) {
      const result = validateSeanceName(raw, []);
      expect(result.ok).toBe(false);
    }
  });

  test("accepte exactement 40 caractères et refuse au-delà", () => {
    const max = "A".repeat(SEANCE_NAME_MAX_LENGTH);
    expect(validateSeanceName(max, []).ok).toBe(true);
    expect(validateSeanceName(`${max}A`, []).ok).toBe(false);
  });

  test("la longueur est mesurée après trim", () => {
    const max = "A".repeat(SEANCE_NAME_MAX_LENGTH);
    expect(validateSeanceName(`  ${max}  `, []).ok).toBe(true);
  });

  test("refuse un nom déjà pris, casse ignorée", () => {
    const result = validateSeanceName("pec", ["Dos", "Pec"]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("existe déjà");
  });

  test("refuse un doublon dont seuls les espaces de bord diffèrent", () => {
    expect(validateSeanceName("Pec", ["  Pec  "]).ok).toBe(false);
  });

  // La séance en cours de renommage n'est pas dans `otherNames` : se renommer
  // à l'identique (ou en changeant juste la casse) doit rester possible.
  test("laisse passer le nom courant quand il est exclu de la liste", () => {
    expect(validateSeanceName("Pec", ["Dos", "LOWER"]).ok).toBe(true);
    expect(validateSeanceName("PEC", ["Dos", "LOWER"]).ok).toBe(true);
  });
});
