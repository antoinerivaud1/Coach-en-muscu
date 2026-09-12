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
      error: `« ${name} » existe déjà dans ce programme`,
    };
  }

  return { ok: true, name };
}
