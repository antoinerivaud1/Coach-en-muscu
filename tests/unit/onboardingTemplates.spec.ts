import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test, expect } from "@playwright/test";
import {
  SEANCE_TEMPLATES,
  estimateSeanceMinutes,
  findTemplate,
  templateMeta,
  uniqueSeanceName,
} from "@/lib/onboardingTemplates";
import { EXERCISE_MUSCLES } from "@/lib/exerciseMuscles";
import { SEANCE_DRAFT_LIMITS, SEANCE_NAME_MAX_LENGTH } from "@/lib/utils/seances";

// CM-86 : modèles de séances de l'onboarding. Tests purs.

/** Noms des exercices système de supabase/seed.sql (base de la CI). */
function seedSystemExerciseNames(): Set<string> {
  const sql = readFileSync(join(process.cwd(), "supabase/seed.sql"), "utf8");
  const names = new Set<string>();
  // Lignes `('<uuid>', '<nom>', '<groupe>', <bool>, null)` du catalogue système.
  const re = /\('[0-9a-f-]{36}',\s*'((?:[^']|'')+)',\s*'[a-z_]+',\s*(?:true|false),\s*null\)/g;
  for (const m of sql.matchAll(re)) names.add(m[1]!.replace(/''/g, "'"));
  return names;
}

test.describe("Modèles de séances (CM-86)", () => {
  test("les 3 modèles de la maquette, dans l'ordre", () => {
    expect(SEANCE_TEMPLATES.map((t) => t.label)).toEqual([
      "Push · Pull · Jambes",
      "Haut · Bas",
      "Full body",
    ]);
    expect(SEANCE_TEMPLATES.map((t) => t.seances.map((s) => s.name))).toEqual([
      ["Push", "Pull", "Jambes"],
      ["Haut du corps", "Bas du corps"],
      ["Corps entier"],
    ]);
  });

  test("chaque exercice référencé existe dans le catalogue système", () => {
    const catalog = new Set(Object.keys(EXERCISE_MUSCLES));
    expect(catalog.size).toBe(81);
    for (const t of SEANCE_TEMPLATES) {
      for (const s of t.seances) {
        for (const e of s.exercises) {
          expect(catalog.has(e.name), `${t.id} / ${s.name} / ${e.name}`).toBe(true);
        }
      }
    }
  });

  test("chaque séance garde au moins 2 exercices présents dans le seed (CI)", () => {
    const seed = seedSystemExerciseNames();
    expect(seed.size).toBeGreaterThanOrEqual(12);
    for (const t of SEANCE_TEMPLATES) {
      for (const s of t.seances) {
        const present = s.exercises.filter((e) => seed.has(e.name));
        expect(present.length, `${t.id} / ${s.name}`).toBeGreaterThanOrEqual(2);
      }
    }
  });

  test("prescriptions dans les bornes du builder, sans doublon, noms valides", () => {
    const { sets, reps, rest } = SEANCE_DRAFT_LIMITS;
    for (const t of SEANCE_TEMPLATES) {
      for (const s of t.seances) {
        expect(s.name.length).toBeLessThanOrEqual(SEANCE_NAME_MAX_LENGTH);
        const names = s.exercises.map((e) => e.name);
        expect(new Set(names).size, s.name).toBe(names.length);
        for (const e of s.exercises) {
          expect(e.sets).toBeGreaterThanOrEqual(sets.min);
          expect(e.sets).toBeLessThanOrEqual(sets.max);
          expect(e.repsMin).toBeGreaterThanOrEqual(reps.min);
          expect(e.repsMax).toBeLessThanOrEqual(reps.max);
          expect(e.repsMin).toBeLessThanOrEqual(e.repsMax);
          expect(e.restSeconds).toBeGreaterThanOrEqual(rest.min);
          expect(e.restSeconds).toBeLessThanOrEqual(rest.max);
        }
      }
    }
  });

  test("méta des cartes, comme sur la maquette", () => {
    expect(SEANCE_TEMPLATES.map(templateMeta)).toEqual([
      "3 séances · 6 exercices chacune",
      "2 séances · 6 exercices chacune",
      "1 séance · 7 exercices",
    ]);
  });

  test("findTemplate : ids connus seulement", () => {
    expect(findTemplate("ppl")?.label).toBe("Push · Pull · Jambes");
    expect(findTemplate("inconnu")).toBeNull();
    expect(findTemplate(undefined)).toBeNull();
  });

  test("uniqueSeanceName : suffixe quand le nom est pris (casse et accents ignorés)", () => {
    expect(uniqueSeanceName("Push", [])).toBe("Push");
    expect(uniqueSeanceName("Push", ["push"])).toBe("Push 2");
    expect(uniqueSeanceName("Push", ["Push", "Push 2"])).toBe("Push 3");
    expect(uniqueSeanceName("Corps entier", ["CORPS ENTIER"])).toBe("Corps entier 2");
  });

  test("estimateSeanceMinutes : arrondi à 5 min, 0 si vide", () => {
    expect(estimateSeanceMinutes([])).toBe(0);
    // 3 séries × (45 + 60) s + 300 s = 615 s ≈ 10 min
    expect(estimateSeanceMinutes([{ target_sets: 3, rest_seconds: 60 }])).toBe(10);
    const push = findTemplate("ppl")!.seances[0]!.exercises.map((e) => ({
      target_sets: e.sets,
      rest_seconds: e.restSeconds,
    }));
    const minutes = estimateSeanceMinutes(push);
    expect(minutes % 5).toBe(0);
    expect(minutes).toBeGreaterThanOrEqual(40);
    expect(minutes).toBeLessThanOrEqual(70);
  });
});
