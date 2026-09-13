import { test, expect } from "@playwright/test";
import {
  MUSCLE_GROUP_SHORT_LABELS,
  suggestSeanceName,
  uniqueSeanceName,
  type MuscleGroup,
} from "@/lib/utils/seances";

// Tests unitaires purs (CM-81) : aucun navigateur, aucune donnée Supabase.
// Lancer : npm run test:unit

test.describe("suggestSeanceName (CM-81)", () => {
  test("retient les deux groupes dominants, libellés courts", () => {
    expect(suggestSeanceName(["chest", "chest", "triceps", "shoulders"])).toBe(
      "Pec & Triceps",
    );
    expect(suggestSeanceName(["back", "back", "biceps"])).toBe("Dos & Biceps");
  });

  test("un seul groupe donne un seul libellé, sans séparateur", () => {
    expect(suggestSeanceName(["quads"])).toBe("Quadris");
    expect(suggestSeanceName(["quads", "quads", "quads"])).toBe("Quadris");
  });

  test("une séance sans exercice n'a pas de nom proposé", () => {
    expect(suggestSeanceName([])).toBe("");
  });

  test("à égalité de comptes, l'ordre d'apparition est conservé", () => {
    expect(suggestSeanceName(["biceps", "back"])).toBe("Biceps & Dos");
    expect(suggestSeanceName(["back", "biceps"])).toBe("Dos & Biceps");
  });

  test("un troisième groupe minoritaire n'apparaît pas", () => {
    const name = suggestSeanceName([
      "chest",
      "chest",
      "triceps",
      "triceps",
      "core",
    ]);
    expect(name).toBe("Pec & Triceps");
    expect(name).not.toContain(MUSCLE_GROUP_SHORT_LABELS.core);
  });

  test("chaque groupe de l'enum a un libellé court", () => {
    const groups: MuscleGroup[] = [
      "chest",
      "back",
      "shoulders",
      "biceps",
      "triceps",
      "quads",
      "hamstrings",
      "glutes",
      "calves",
      "core",
      "other",
    ];
    for (const group of groups) {
      expect(suggestSeanceName([group])).toBe(
        MUSCLE_GROUP_SHORT_LABELS[group],
      );
    }
  });
});

test.describe("uniqueSeanceName (CM-81)", () => {
  test("laisse le nom tel quel s'il est libre", () => {
    expect(uniqueSeanceName("Pec", [])).toBe("Pec");
    expect(uniqueSeanceName("Pec", ["Dos", "Jambes"])).toBe("Pec");
  });

  test("suffixe au premier numéro libre", () => {
    expect(uniqueSeanceName("Pec", ["Pec"])).toBe("Pec 2");
    expect(uniqueSeanceName("Pec", ["Pec", "Pec 2"])).toBe("Pec 3");
    expect(uniqueSeanceName("Pec", ["Pec", "Pec 3"])).toBe("Pec 2");
  });

  test("ignore la casse, comme validateSeanceName", () => {
    expect(uniqueSeanceName("pec", ["Pec"])).toBe("pec 2");
    expect(uniqueSeanceName("Pec", ["pec", "PEC 2"])).toBe("Pec 3");
  });

  test("ignore les espaces de bord", () => {
    expect(uniqueSeanceName("  Pec  ", ["Pec "])).toBe("Pec 2");
  });

  test("une base vide reste vide : rien à rendre unique", () => {
    expect(uniqueSeanceName("", ["Pec"])).toBe("");
    expect(uniqueSeanceName("   ", [])).toBe("");
  });
});
