// Liste des exercices d'une séance (CM-62).
//
// Un exercice ajouté en cours de séance n'existe que par ses `session_sets` :
// aucune table, aucune colonne, et `program_days` / `program_exercises` ne
// sont jamais écrits. La seule chose à reconstruire au rechargement est donc
// la liste affichée, et c'est le rôle de ce module : une fonction pure, sans
// I/O ni React, qui fusionne le programme du jour, les séries déjà en base et
// les exercices ajoutés en mémoire.

/** D'où vient l'exercice dans la séance courante. */
export type SessionExerciseSource = "program" | "extra";

/**
 * Forme unique d'un exercice de séance, que le programme l'ait prévu ou qu'il
 * ait été ajouté en cours de route. L'écran de saisie ne distingue les deux
 * que par `source` (badge « Hors programme », croix de retrait).
 */
export interface SessionExercise {
  exerciseId: string;
  name: string;
  muscleGroup: string;
  targetSets: number;
  targetRepsMin: number;
  targetRepsMax: number;
  restSeconds: number;
  source: SessionExerciseSource;
}

/**
 * Cibles d'un exercice ajouté : le programme n'en prévoit aucune, on applique
 * les mêmes valeurs par défaut que le builder de programme (CM-13).
 */
export const EXTRA_EXERCISE_DEFAULTS = {
  targetSets: 3,
  targetRepsMin: 8,
  targetRepsMax: 12,
  restSeconds: 90,
} as const;

/** Ligne `program_exercises` telle que chargée par `getDayWithExercises`. */
export interface ProgramExerciseInput {
  exercise_id: string;
  order_index: number;
  target_sets: number;
  target_reps_min: number;
  target_reps_max: number;
  rest_seconds: number;
  exercises: { name: string; muscle_group: string } | null;
}

/**
 * Série déjà enregistrée pour la séance. Seuls l'exercice et l'instant de
 * création comptent ici : `created_at` donne l'ordre d'apparition des
 * exercices hors programme.
 */
export interface ExistingSetInput {
  exercise_id: string;
  created_at: string;
}

/**
 * Exercice hors programme connu du client : soit reconstruit depuis les séries
 * orphelines (nom et groupe chargés en un seul `select` côté serveur), soit
 * ajouté en mémoire pendant la séance et pas encore validé.
 */
export interface ExtraExerciseInput {
  exerciseId: string;
  name: string;
  muscleGroup: string;
}

const FALLBACK_NAME = "Exercice";
const FALLBACK_MUSCLE_GROUP = "other";

/**
 * Liste ordonnée des exercices de la séance : le programme d'abord, dans
 * l'ordre `order_index`, puis les exercices hors programme.
 *
 * Les exercices hors programme sont ordonnés en deux temps :
 *  1. ceux qui ont déjà une série en base, dans l'ordre de leur première série
 *     (`created_at`) — c'est ce qui rend la séance identique après un
 *     rechargement de la page ;
 *  2. ceux qui n'ont encore aucune série (ajoutés à l'instant), dans l'ordre
 *     où ils ont été ajoutés.
 *
 * Un exercice déjà prévu par le programme n'est jamais dupliqué en `extra`,
 * même si `extraExercises` le contient ou qu'une série le référence. Un
 * exercice ajouté sans aucune série n'a aucune trace en base : il disparaît au
 * rechargement, et c'est voulu.
 */
export function buildSessionExercises(
  programExercises: readonly ProgramExerciseInput[],
  existingSets: readonly ExistingSetInput[],
  extraExercises: readonly ExtraExerciseInput[],
): SessionExercise[] {
  const fromProgram = [...programExercises]
    .sort((a, b) => a.order_index - b.order_index)
    .map<SessionExercise>((pe) => ({
      exerciseId: pe.exercise_id,
      name: pe.exercises?.name ?? FALLBACK_NAME,
      muscleGroup: pe.exercises?.muscle_group ?? FALLBACK_MUSCLE_GROUP,
      targetSets: pe.target_sets,
      targetRepsMin: pe.target_reps_min,
      targetRepsMax: pe.target_reps_max,
      restSeconds: pe.rest_seconds,
      source: "program",
    }));

  const programIds = new Set(fromProgram.map((e) => e.exerciseId));

  // Métadonnées des exercices hors programme, par id.
  const metaById = new Map<string, ExtraExerciseInput>();
  for (const extra of extraExercises) {
    if (!metaById.has(extra.exerciseId)) metaById.set(extra.exerciseId, extra);
  }

  // 1. Exercices orphelins reconstruits depuis les séries, dans l'ordre de la
  //    première série de chacun.
  const firstSetAt = new Map<string, string>();
  for (const set of existingSets) {
    if (programIds.has(set.exercise_id)) continue;
    const known = firstSetAt.get(set.exercise_id);
    if (known === undefined || set.created_at < known) {
      firstSetAt.set(set.exercise_id, set.created_at);
    }
  }
  const loggedIds = [...firstSetAt.entries()]
    .sort((a, b) => (a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0))
    .map(([exerciseId]) => exerciseId);

  // 2. Exercices ajoutés en mémoire, sans série, dans l'ordre d'ajout.
  const loggedIdSet = new Set(loggedIds);
  const pendingIds = extraExercises
    .map((e) => e.exerciseId)
    .filter((id) => !programIds.has(id) && !loggedIdSet.has(id));

  const seen = new Set<string>();
  const fromExtras: SessionExercise[] = [];
  for (const exerciseId of [...loggedIds, ...pendingIds]) {
    if (seen.has(exerciseId)) continue;
    seen.add(exerciseId);
    const meta = metaById.get(exerciseId);
    fromExtras.push({
      exerciseId,
      name: meta?.name ?? FALLBACK_NAME,
      muscleGroup: meta?.muscleGroup ?? FALLBACK_MUSCLE_GROUP,
      ...EXTRA_EXERCISE_DEFAULTS,
      source: "extra",
    });
  }

  return [...fromProgram, ...fromExtras];
}

/**
 * Exercice à afficher à la reprise d'une séance en cours (CM-78).
 *
 * Le premier exercice dont les séries prévues ne sont pas toutes validées,
 * sinon le dernier : reprendre une séance, c'est retomber sur le premier
 * exercice qui reste à faire, et sur le dernier quand tout est fait. Un
 * exercice sans cible compte pour une série, comme dans la progression
 * (CM-67), sans quoi il serait toujours « terminé ».
 */
export function resumeExerciseIndex(
  exercises: readonly { exerciseId: string; targetSets: number }[],
  validatedCounts: Readonly<Record<string, number>>,
): number {
  if (exercises.length === 0) return 0;
  for (let i = 0; i < exercises.length; i += 1) {
    const ex = exercises[i]!;
    const planned = ex.targetSets > 0 ? ex.targetSets : 1;
    if ((validatedCounts[ex.exerciseId] ?? 0) < planned) return i;
  }
  return exercises.length - 1;
}
