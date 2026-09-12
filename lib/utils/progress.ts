// Progression de séance (CM-67) : séries validées / séries prévues.
// Fonction pure, sans I/O ni React, donc testable seule et réutilisable
// partout où l'on dispose des séries prévues et des séries loguées.

export interface ProgressExerciseInput {
  exerciseId: string;
  /**
   * Séries prévues (`target_sets` de `program_exercises`). `null` ou 0 quand
   * l'exercice n'a pas de cible : on retombe alors sur les séries loguées.
   */
  plannedSets: number | null;
  /**
   * Séries validées pour cet exercice, échauffement inclus : un `session_sets`
   * avec `is_warmup = true` compte dans la progression (il reste exclu du
   * volume, qui n'est pas concerné ici).
   */
  loggedSets: number;
}

export interface ExerciseProgress {
  exerciseId: string;
  done: number;
  planned: number;
  isComplete: boolean;
}

export interface SessionProgress {
  done: number;
  total: number;
  exercisesRemaining: number;
  perExercise: ExerciseProgress[];
}

/** Normalise un compteur de séries : entier, jamais négatif. */
function toCount(value: number | null | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.floor(value));
}

/**
 * Progression globale de la séance et sous-progression par exercice.
 *
 * Règles :
 * - `planned` = séries prévues ; à défaut, les séries déjà loguées, minimum 1
 *   (un exercice sans cible ne doit jamais peser 0 dans le dénominateur).
 * - `done` est plafonné à `planned` exercice par exercice : une série en plus
 *   que prévu ne fait pas dépasser la barre au-delà de 100 %.
 * - Le dénominateur se recalcule à chaque appel : un exercice ajouté en cours
 *   de séance augmente `total` et fait légèrement reculer la barre, sans
 *   traitement particulier ici.
 */
export function computeSessionProgress(
  exercises: readonly ProgressExerciseInput[],
): SessionProgress {
  const perExercise: ExerciseProgress[] = exercises.map((ex) => {
    const logged = toCount(ex.loggedSets);
    const target = toCount(ex.plannedSets);
    const planned = target > 0 ? target : Math.max(logged, 1);
    const done = Math.min(logged, planned);
    return {
      exerciseId: ex.exerciseId,
      done,
      planned,
      isComplete: done >= planned,
    };
  });

  let done = 0;
  let total = 0;
  let exercisesRemaining = 0;
  for (const ex of perExercise) {
    done += ex.done;
    total += ex.planned;
    if (!ex.isComplete) exercisesRemaining += 1;
  }

  return { done, total, exercisesRemaining, perExercise };
}
