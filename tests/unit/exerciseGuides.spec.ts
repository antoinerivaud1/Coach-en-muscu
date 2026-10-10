import { readFileSync } from "node:fs";
import path from "node:path";
import { test, expect } from "@playwright/test";
import { EXERCISE_GUIDES, getGuide } from "@/lib/exerciseGuides";
import { EXERCISE_MUSCLES, getMuscleLegend, muscleLabels } from "@/lib/exerciseMuscles";
import { exerciseKey } from "@/lib/exerciseKey";

// Tests unitaires purs (CM-30) : contenu statique des fiches exercice.
// Lancer : npm run test:unit

/** Noms des exercices système (`duo_id` null) du seed local. */
function seedSystemExerciseNames(): string[] {
  const sql = readFileSync(path.join(process.cwd(), "supabase/seed.sql"), "utf8");
  const names: string[] = [];
  const re = /\(\s*'[0-9a-f-]{36}',\s*'((?:[^']|'')+)',\s*'[a-z]+',\s*(?:true|false),\s*null\s*\)/g;
  for (const m of sql.matchAll(re)) names.push(m[1]!.replace(/''/g, "'"));
  return names;
}

test.describe("Fiches exercice : couverture du catalogue système (CM-30)", () => {
  test("les 81 exercices du catalogue ont une fiche, et seulement eux", () => {
    const guides = Object.keys(EXERCISE_GUIDES).sort();
    const catalog = Object.keys(EXERCISE_MUSCLES).sort();
    expect(guides).toHaveLength(81);
    expect(guides).toEqual(catalog);
  });

  test("chaque exercice système a exactement 3 étapes et 2 à 3 erreurs", () => {
    for (const [name, guide] of Object.entries(EXERCISE_GUIDES)) {
      expect(guide.steps, name).toHaveLength(3);
      expect(guide.avoid.length, name).toBeGreaterThanOrEqual(2);
      expect(guide.avoid.length, name).toBeLessThanOrEqual(3);
      for (const line of [...guide.steps, ...guide.avoid, guide.stretch]) {
        expect(line.trim().length, name).toBeGreaterThan(0);
      }
    }
  });

  test("les exercices système du seed retrouvent tous leur fiche", () => {
    const names = seedSystemExerciseNames();
    expect(names.length).toBeGreaterThan(0);
    for (const name of names) {
      expect(getGuide(name), name).not.toBeNull();
    }
  });

  test("la recherche ignore accents, casse et espaces superflus", () => {
    const ref = getGuide("Soulevé de terre roumain");
    expect(ref).not.toBeNull();
    expect(getGuide("souleve de terre  ROUMAIN ")).toBe(ref);
    expect(exerciseKey("  Élévations   latérales ")).toBe("elevations laterales");
  });

  test("exercice perso ou inconnu : pas de fiche", () => {
    expect(getGuide("Squat barre", { isCustom: true })).toBeNull();
    expect(getGuide("Mon exercice maison")).toBeNull();
  });
});

test.describe("Fiches exercice : typographie française (CM-30)", () => {
  const allLines = Object.values(EXERCISE_GUIDES).flatMap((g) => [
    ...g.steps,
    ...g.avoid,
    g.stretch,
  ]);

  test("pas de tiret cadratin", () => {
    for (const line of allLines) expect(line, line).not.toContain("\u2014");
  });

  test("jamais d'espace ordinaire avant : ; ? ! ni dans « 12 kg »", () => {
    for (const line of allLines) {
      expect(line, line).not.toMatch(/ [:;?!]/);
      expect(line, line).not.toMatch(/\d (kg|cm|s|min)\b/);
    }
  });

  test("phrases courtes, terminées par un point", () => {
    for (const line of allLines) {
      expect(line.length, line).toBeLessThanOrEqual(100);
      expect(line.endsWith("."), line).toBe(true);
    }
  });
});

test.describe("Légende de la carte musculaire (CM-30)", () => {
  test("développé couché : principal et secondaires lisibles", () => {
    expect(getMuscleLegend("Développé couché barre", "chest")).toEqual({
      primary: ["Pectoraux"],
      secondary: ["Triceps", "Deltoïdes antérieurs"],
    });
  });

  test("deltoïdes antérieurs et postérieurs ensemble se lisent « Deltoïdes »", () => {
    expect(muscleLabels(["front-deltoids", "back-deltoids"])).toEqual(["Deltoïdes"]);
  });

  test("exercice perso : légende déduite du groupe musculaire", () => {
    expect(getMuscleLegend("Mon exercice maison", "quads")).toEqual({
      primary: ["Quadriceps"],
      secondary: ["Fessiers"],
    });
  });
});
