// Helpers d'entraînement: 1RM estimée, formatage.

/**
 * 1RM estimée (formule d'Epley). Renvoie 0 si reps/poids invalides.
 */
export function estimatedOneRepMax(weightKg: number, reps: number): number {
  if (weightKg <= 0 || reps <= 0) return 0;
  if (reps === 1) return weightKg;
  return weightKg * (1 + reps / 30);
}

/** Meilleure e1RM d'une liste de séries. */
export function bestE1RM(sets: { weight_kg: number; reps: number }[]): number {
  let best = 0;
  for (const s of sets) {
    const e = estimatedOneRepMax(s.weight_kg, s.reps);
    if (e > best) best = e;
  }
  return best;
}

/** Poids max soulevé d'une liste de séries. */
export function topWeight(sets: { weight_kg: number }[]): number {
  let best = 0;
  for (const s of sets) {
    if (s.weight_kg > best) best = s.weight_kg;
  }
  return best;
}

/** Volume total (somme poids x reps). */
export function totalVolume(sets: { weight_kg: number; reps: number }[]): number {
  return sets.reduce((acc, s) => acc + s.weight_kg * s.reps, 0);
}

/** Formate un poids: 60 -> "60", 62.5 -> "62.5". */
export function formatWeight(kg: number): string {
  return Number.isInteger(kg) ? String(kg) : kg.toFixed(1);
}

/** Formate une date ISO en court FR: "12 juin". */
export function formatDateShort(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "short",
  });
}

/** Formate une date ISO complète FR: "ven. 12 juin 2026". */
export function formatDateLong(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-FR", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export const MUSCLE_GROUP_LABELS: Record<string, string> = {
  chest: "Pectoraux",
  back: "Dos",
  shoulders: "Épaules",
  biceps: "Biceps",
  triceps: "Triceps",
  quads: "Quadriceps",
  hamstrings: "Ischio-jambiers",
  glutes: "Fessiers",
  calves: "Mollets",
  core: "Abdominaux",
  other: "Autre",
};
