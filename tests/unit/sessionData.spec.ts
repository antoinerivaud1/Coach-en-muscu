import { test, expect } from "@playwright/test";
import { buildInitialSets } from "@/lib/data/sessionDetail";
import { isTransportError } from "@/lib/data/sessionWrites";
import type { SessionExercise } from "@/lib/utils/sessionExercises";
import type { SessionSetRow } from "@/lib/queries/sessions";

// CM-88 (PR 6) : parties pures de la couche data de l'écran de séance.

test.describe("isTransportError", () => {
  test("erreur réseau de supabase-js (code vide) : transport", () => {
    const fetchFailed = { code: "", message: "TypeError: Failed to fetch" };
    const noCode: { code?: string; message: string } = { message: "Load failed" };
    expect(isTransportError(fetchFailed)).toBe(true);
    expect(isTransportError(noCode)).toBe(true);
  });
  test("erreur Postgres ou PostgREST (code présent) : pas transport", () => {
    expect(isTransportError({ code: "42501" })).toBe(false);
    expect(isTransportError({ code: "PGRST116" })).toBe(false);
  });
  test("pas d'erreur : pas transport", () => {
    expect(isTransportError(null)).toBe(false);
    expect(isTransportError(undefined)).toBe(false);
  });
});

const exercise = (id: string, targetSets = 3): SessionExercise => ({
  exerciseId: id,
  name: id,
  muscleGroup: "pecs",
  targetSets,
  targetRepsMin: 8,
  targetRepsMax: 10,
  restSeconds: 90,
  source: "program",
} as SessionExercise);

const row = (exerciseId: string, setIndex: number, weight: number, reps: number): SessionSetRow => ({
  id: `${exerciseId}-${setIndex}`,
  exercise_id: exerciseId,
  set_index: setIndex,
  weight_kg: weight,
  reps,
  is_warmup: false,
  created_at: "2026-10-12T10:00:00Z",
});

test.describe("buildInitialSets", () => {
  test("séance en cours reprise : séries écrites, puis une ligne héritée, puis des vides", () => {
    const out = buildInitialSets([exercise("a", 3)], [row("a", 1, 60, 8)], {}, true);
    expect(out.a).toEqual([
      { id: "a-1", setIndex: 1, weight: "60", reps: "8", isWarmup: false },
      { id: null, setIndex: null, weight: "60", reps: "8", isWarmup: false },
      { id: null, setIndex: null, weight: "", reps: "", isWarmup: false },
    ]);
  });

  test("« Modifier » d'une séance terminée : exactement ses séries", () => {
    const out = buildInitialSets([exercise("a", 4)], [row("a", 2, 50, 6), row("a", 1, 40, 8)], {}, false);
    expect(out.a?.map((s) => s.id)).toEqual(["a-1", "a-2"]);
  });

  test("exercice pas encore commencé : au moins une ligne", () => {
    const out = buildInitialSets([exercise("b", 0)], [], {}, true);
    expect(out.b).toHaveLength(1);
  });
});
