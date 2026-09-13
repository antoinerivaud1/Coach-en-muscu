// Helpers de la bibliothèque de séances types (CM-65).
//
// Note vocabulaire : côté base, une séance type reste une ligne de
// `program_days` (le schéma n'est pas renommé, cf. CM-65). Le mot « séance »
// n'existe que dans l'UI et dans ces helpers.

import type { Database } from "@/lib/types/database";
import { MUSCLE_GROUP_LABELS } from "@/lib/utils/training";

export type MuscleGroup = Database["public"]["Enums"]["muscle_group"];

/** Nombre de tags affichés sur une carte avant le compteur « +N ». */
export const MAX_VISIBLE_TAGS = 3;

export type MuscleTag = {
  group: MuscleGroup;
  label: string;
  count: number;
};

/**
 * Tags de groupes musculaires d'une séance, dérivés à la volée des exercices
 * qu'elle contient — jamais stockés en base : un tag stocké deviendrait faux en
 * silence dès qu'un exercice est remplacé.
 *
 * Dédupliqué, trié par nombre d'exercices décroissant (groupe dominant en
 * premier) ; à égalité l'ordre d'apparition est conservé. Une séance sans
 * exercice n'a aucun tag.
 */
export function deriveMuscleTags(groups: MuscleGroup[]): MuscleTag[] {
  const counts = new Map<MuscleGroup, number>();
  for (const group of groups) {
    counts.set(group, (counts.get(group) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([group, count]) => ({
      group,
      count,
      label: MUSCLE_GROUP_LABELS[group] ?? group,
    }))
    .sort((a, b) => b.count - a.count);
}

/** Découpe les tags en « visibles » + nombre de tags masqués (badge « +N »). */
export function splitVisibleTags(
  tags: MuscleTag[],
  max: number = MAX_VISIBLE_TAGS,
): { visible: MuscleTag[]; overflow: number } {
  return {
    visible: tags.slice(0, max),
    overflow: Math.max(0, tags.length - max),
  };
}

/** Nombre total de séries d'une séance (somme des `target_sets`). */
export function countSets(exercises: { target_sets: number }[]): number {
  return exercises.reduce((total, e) => total + (e.target_sets || 0), 0);
}

// ---- Nom d'une séance type (CM-80) ----

/** Longueur maximale du nom d'une séance type. */
export const SEANCE_NAME_MAX_LENGTH = 40;

export type SeanceNameCheck =
  | { ok: true; name: string }
  | { ok: false; error: string };

/** Clé de comparaison des noms : insensible à la casse et aux espaces de bord. */
function nameKey(name: string): string {
  return name.trim().toLocaleLowerCase("fr-FR");
}

/**
 * Valide le nom d'une séance type avant enregistrement.
 *
 * Même fonction côté client (erreur affichée sous le champ, sans aller-retour)
 * et côté server action (seule validation qui fait foi) : les deux ne peuvent
 * pas diverger.
 *
 * `otherNames` = les noms des AUTRES séances du même programme ; la séance en
 * cours de renommage doit en être exclue, sinon se renommer en soi-même
 * échouerait.
 */
export function validateSeanceName(
  raw: string,
  otherNames: string[],
): SeanceNameCheck {
  const name = raw.trim();

  if (!name) {
    return { ok: false, error: "Le nom de la séance est obligatoire" };
  }
  if (name.length > SEANCE_NAME_MAX_LENGTH) {
    return {
      ok: false,
      error: `${SEANCE_NAME_MAX_LENGTH} caractères maximum (${name.length} saisis)`,
    };
  }
  const key = nameKey(name);
  if (otherNames.some((other) => nameKey(other) === key)) {
    return {
      ok: false,
      error: `« ${name} » existe déjà dans tes séances`,
    };
  }

  return { ok: true, name };
}

/**
 * Nom court d'un groupe musculaire, pour composer le nom d'une séance
 * (CM-81). Distinct de `MUSCLE_GROUP_LABELS` : « Pec & Triceps » se lit d'un
 * coup d'œil sur une carte, « Pectoraux & Triceps » déborde.
 */
export const MUSCLE_GROUP_SHORT_LABELS: Record<MuscleGroup, string> = {
  chest: "Pec",
  back: "Dos",
  shoulders: "Épaules",
  biceps: "Biceps",
  triceps: "Triceps",
  quads: "Quadris",
  hamstrings: "Ischios",
  glutes: "Fessiers",
  calves: "Mollets",
  core: "Abdos",
  other: "Autre",
};

/** Nombre de groupes retenus dans un nom proposé. */
const SUGGESTED_NAME_GROUPS = 2;

/**
 * Nom proposé d'après les groupes musculaires dominants (CM-81).
 *
 * `groups` = le groupe de CHAQUE exercice de la séance, répétitions comprises,
 * comme pour `deriveMuscleTags`. Renvoie "" sans exercice.
 *
 * Règle : les deux groupes les plus représentés (ordre de `deriveMuscleTags`,
 * donc à égalité l'ordre d'apparition), libellés courts, joints par " & ".
 * Un seul groupe = ce seul libellé.
 */
export function suggestSeanceName(groups: MuscleGroup[]): string {
  return deriveMuscleTags(groups)
    .slice(0, SUGGESTED_NAME_GROUPS)
    .map((tag) => MUSCLE_GROUP_SHORT_LABELS[tag.group] ?? tag.label)
    .join(" & ");
}

/**
 * Rend un nom proposé libre dans le programme, en le suffixant " 2", " 3"…
 * jusqu'à ce qu'il ne collisionne plus (CM-81).
 *
 * Même comparaison que `validateSeanceName` : casse et espaces de bord
 * ignorés, sans quoi le nom proposé passerait ici pour libre puis serait
 * refusé à l'enregistrement. Une base vide reste vide : il n'y a rien à
 * rendre unique tant que la séance n'a aucun exercice.
 */
export function uniqueSeanceName(base: string, otherNames: string[]): string {
  const trimmed = base.trim();
  if (!trimmed) return "";

  const taken = new Set(otherNames.map(nameKey));
  if (!taken.has(nameKey(trimmed))) return trimmed;

  let suffix = 2;
  while (taken.has(nameKey(`${trimmed} ${suffix}`))) suffix += 1;
  return `${trimmed} ${suffix}`;
}

// ---- Brouillon de séance de l'écran unique (CM-81) ----

/**
 * Un exercice tel que l'écran de création / édition le manipule : les
 * colonnes de `program_exercises` utiles, plus le nom et le groupe nécessaires
 * à l'affichage et au nom proposé. `order_index` n'y est pas — c'est la
 * position dans le tableau qui fait foi, et elle est réécrite à
 * l'enregistrement.
 */
export type SeanceDraftExercise = {
  exerciseId: string;
  name: string;
  muscleGroup: MuscleGroup;
  targetSets: number;
  targetRepsMin: number;
  targetRepsMax: number;
  restSeconds: number;
};

/**
 * Bornes des cibles d'un exercice. Appliquées côté client (les boutons − / +
 * s'y arrêtent) ET côté serveur (seule validation qui fait foi) : un brouillon
 * bricolé ne doit pas pouvoir écrire 999 séries.
 */
export const SEANCE_DRAFT_LIMITS = {
  sets: { min: 1, max: 10, step: 1 },
  reps: { min: 1, max: 50, step: 1 },
  rest: { min: 0, max: 600, step: 15 },
} as const;

/** Ramène une valeur dans ses bornes. */
export function clampDraftValue(
  value: number,
  bounds: { min: number; max: number },
): number {
  if (!Number.isFinite(value)) return bounds.min;
  return Math.min(bounds.max, Math.max(bounds.min, Math.round(value)));
}
