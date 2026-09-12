import { test, expect } from "@playwright/test";
import { computeSessionProgress } from "@/lib/utils/progress";

// Tests unitaires purs (CM-67) : aucun navigateur, aucune donnée Supabase.
// Lancer : npm run test:unit

test("séance vide : rien de validé, tout reste à faire", () => {
  const p = computeSessionProgress([
    { exerciseId: "a", plannedSets: 4, loggedSets: 0 },
    { exerciseId: "b", plannedSets: 3, loggedSets: 0 },
  ]);
  expect(p.done).toBe(0);
  expect(p.total).toBe(7);
  expect(p.exercisesRemaining).toBe(2);
  expect(p.perExercise).toEqual([
    { exerciseId: "a", done: 0, planned: 4, isComplete: false },
    { exerciseId: "b", done: 0, planned: 3, isComplete: false },
  ]);
});

test("séance à mi-parcours : un exercice terminé, un entamé", () => {
  const p = computeSessionProgress([
    { exerciseId: "a", plannedSets: 4, loggedSets: 4 },
    { exerciseId: "b", plannedSets: 4, loggedSets: 2 },
    { exerciseId: "c", plannedSets: 3, loggedSets: 0 },
  ]);
  expect(p.done).toBe(6);
  expect(p.total).toBe(11);
  expect(p.exercisesRemaining).toBe(2);
  expect(p.perExercise[0]?.isComplete).toBe(true);
  expect(p.perExercise[1]?.isComplete).toBe(false);
});

test("plus de séries que prévu : done plafonné, jamais plus de 100 %", () => {
  const p = computeSessionProgress([
    { exerciseId: "a", plannedSets: 3, loggedSets: 6 },
    { exerciseId: "b", plannedSets: 3, loggedSets: 0 },
  ]);
  expect(p.done).toBe(3);
  expect(p.total).toBe(6);
  expect(p.perExercise[0]).toEqual({
    exerciseId: "a",
    done: 3,
    planned: 3,
    isComplete: true,
  });
  expect(p.exercisesRemaining).toBe(1);
});

test("l'échauffement compte dans la progression", () => {
  // Une série d'échauffement validée est une série loguée comme une autre :
  // 1 échauffement + 1 série effective = 2 sur 4.
  const p = computeSessionProgress([
    { exerciseId: "a", plannedSets: 4, loggedSets: 2 },
  ]);
  expect(p.done).toBe(2);
  expect(p.total).toBe(4);
});

test("exercice sans séries prévues : on retombe sur les séries loguées", () => {
  const p = computeSessionProgress([
    { exerciseId: "a", plannedSets: null, loggedSets: 3 },
    { exerciseId: "b", plannedSets: 0, loggedSets: 0 },
  ]);
  expect(p.perExercise[0]).toEqual({
    exerciseId: "a",
    done: 3,
    planned: 3,
    isComplete: true,
  });
  // Sans cible ni série loguée, l'exercice pèse 1 : il reste à faire.
  expect(p.perExercise[1]).toEqual({
    exerciseId: "b",
    done: 0,
    planned: 1,
    isComplete: false,
  });
  expect(p.done).toBe(3);
  expect(p.total).toBe(4);
  expect(p.exercisesRemaining).toBe(1);
});

test("séance terminée : done égale total, plus aucun exercice restant", () => {
  const p = computeSessionProgress([
    { exerciseId: "a", plannedSets: 4, loggedSets: 4 },
    { exerciseId: "b", plannedSets: 2, loggedSets: 5 },
  ]);
  expect(p.done).toBe(6);
  expect(p.total).toBe(6);
  expect(p.exercisesRemaining).toBe(0);
});

test("aucun exercice : progression neutre", () => {
  const p = computeSessionProgress([]);
  expect(p).toEqual({
    done: 0,
    total: 0,
    exercisesRemaining: 0,
    perExercise: [],
  });
});

test("un exercice ajouté en cours de séance fait reculer la barre", () => {
  const before = computeSessionProgress([
    { exerciseId: "a", plannedSets: 4, loggedSets: 4 },
  ]);
  const after = computeSessionProgress([
    { exerciseId: "a", plannedSets: 4, loggedSets: 4 },
    { exerciseId: "b", plannedSets: 4, loggedSets: 0 },
  ]);
  expect(before.done / before.total).toBe(1);
  expect(after.done / after.total).toBe(0.5);
});
