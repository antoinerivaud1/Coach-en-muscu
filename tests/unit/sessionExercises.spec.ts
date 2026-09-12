import { test, expect } from "@playwright/test";
import {
  buildSessionExercises,
  resumeExerciseIndex,
  EXTRA_EXERCISE_DEFAULTS,
  type ExistingSetInput,
  type ExtraExerciseInput,
  type ProgramExerciseInput,
} from "@/lib/utils/sessionExercises";

// Tests unitaires purs (CM-62) : aucun navigateur, aucune donnée Supabase.
// Lancer : npm run test:unit

function programExercise(
  exercise_id: string,
  order_index: number,
  name = exercise_id,
): ProgramExerciseInput {
  return {
    exercise_id,
    order_index,
    target_sets: 4,
    target_reps_min: 6,
    target_reps_max: 10,
    rest_seconds: 120,
    exercises: { name, muscle_group: "chest" },
  };
}

function set(exercise_id: string, created_at: string): ExistingSetInput {
  return { exercise_id, created_at };
}

function extra(exerciseId: string, name = exerciseId): ExtraExerciseInput {
  return { exerciseId, name, muscleGroup: "back" };
}

test("programme seul : l'ordre order_index est respecté, tout est `program`", () => {
  const list = buildSessionExercises(
    [programExercise("b", 1, "Développé"), programExercise("a", 0, "Squat")],
    [],
    [],
  );
  expect(list.map((e) => e.exerciseId)).toEqual(["a", "b"]);
  expect(list.map((e) => e.name)).toEqual(["Squat", "Développé"]);
  expect(list.every((e) => e.source === "program")).toBe(true);
  expect(list[0]).toMatchObject({
    targetSets: 4,
    targetRepsMin: 6,
    targetRepsMax: 10,
    restSeconds: 120,
    muscleGroup: "chest",
  });
});

test("programme + extra : les ajouts passent après, avec les cibles par défaut", () => {
  const list = buildSessionExercises(
    [programExercise("a", 0), programExercise("b", 1)],
    [],
    [extra("x", "Tirage"), extra("y", "Curl")],
  );
  expect(list.map((e) => e.exerciseId)).toEqual(["a", "b", "x", "y"]);
  expect(list.map((e) => e.source)).toEqual([
    "program",
    "program",
    "extra",
    "extra",
  ]);
  expect(list[2]).toMatchObject({
    name: "Tirage",
    muscleGroup: "back",
    ...EXTRA_EXERCISE_DEFAULTS,
  });
});

test("série orpheline : l'exercice est reconstruit en extra", () => {
  const list = buildSessionExercises(
    [programExercise("a", 0)],
    [set("a", "2026-09-12T10:00:00Z"), set("x", "2026-09-12T10:05:00Z")],
    [extra("x", "Tirage")],
  );
  expect(list.map((e) => e.exerciseId)).toEqual(["a", "x"]);
  expect(list[1]).toMatchObject({
    source: "extra",
    name: "Tirage",
    targetSets: 3,
    targetRepsMin: 8,
    targetRepsMax: 12,
    restSeconds: 90,
  });
});

test("séries orphelines : ordre de la première série, pas de l'ordre des séries", () => {
  const list = buildSessionExercises(
    [programExercise("a", 0)],
    [
      set("y", "2026-09-12T10:10:00Z"),
      set("x", "2026-09-12T10:05:00Z"),
      set("y", "2026-09-12T10:02:00Z"), // 1re série de y, antérieure à celle de x
      set("x", "2026-09-12T10:20:00Z"),
    ],
    [extra("x"), extra("y")],
  );
  expect(list.map((e) => e.exerciseId)).toEqual(["a", "y", "x"]);
});

test("un exercice du programme n'est jamais dupliqué en extra", () => {
  const list = buildSessionExercises(
    [programExercise("a", 0, "Squat")],
    [set("a", "2026-09-12T10:00:00Z")],
    [extra("a", "Squat")],
  );
  expect(list).toHaveLength(1);
  expect(list[0]).toMatchObject({
    exerciseId: "a",
    source: "program",
    targetSets: 4,
  });
});

test("extras déjà logués puis extras sans série : les logués passent devant", () => {
  const list = buildSessionExercises(
    [programExercise("a", 0)],
    [set("y", "2026-09-12T10:05:00Z")],
    // `x` a été ajouté en mémoire avant que `y` n'existe : `y` a des séries en
    // base, il est donc reconstruit en premier.
    [extra("x"), extra("y")],
  );
  expect(list.map((e) => e.exerciseId)).toEqual(["a", "y", "x"]);
});

test("exercice inconnu du catalogue : libellés de repli, jamais de crash", () => {
  const list = buildSessionExercises(
    [],
    [set("orphan", "2026-09-12T10:00:00Z")],
    [],
  );
  expect(list).toEqual([
    {
      exerciseId: "orphan",
      name: "Exercice",
      muscleGroup: "other",
      targetSets: 3,
      targetRepsMin: 8,
      targetRepsMax: 12,
      restSeconds: 90,
      source: "extra",
    },
  ]);
});

// ---------- Reprise d'une séance en cours (CM-78) ----------

test("reprise : on rouvre sur le premier exercice non terminé", () => {
  const exercises = [
    { exerciseId: "a", targetSets: 3 },
    { exerciseId: "b", targetSets: 4 },
    { exerciseId: "c", targetSets: 3 },
  ];
  expect(resumeExerciseIndex(exercises, { a: 3, b: 2 })).toBe(1);
  expect(resumeExerciseIndex(exercises, {})).toBe(0);
  expect(resumeExerciseIndex(exercises, { a: 3, b: 4 })).toBe(2);
});

test("reprise : séance entièrement validée, on rouvre sur le dernier exercice", () => {
  const exercises = [
    { exerciseId: "a", targetSets: 2 },
    { exerciseId: "b", targetSets: 2 },
  ];
  expect(resumeExerciseIndex(exercises, { a: 2, b: 2 })).toBe(1);
  // Plus de séries que prévu compte quand même comme terminé.
  expect(resumeExerciseIndex(exercises, { a: 5, b: 3 })).toBe(1);
});

test("reprise : un exercice sans cible est terminé dès sa première série", () => {
  const exercises = [
    { exerciseId: "a", targetSets: 0 },
    { exerciseId: "b", targetSets: 3 },
  ];
  expect(resumeExerciseIndex(exercises, {})).toBe(0);
  expect(resumeExerciseIndex(exercises, { a: 1 })).toBe(1);
});

test("reprise : une séance sans exercice ne plante pas", () => {
  expect(resumeExerciseIndex([], {})).toBe(0);
});
