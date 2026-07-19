// Règle de pré-remplissage d'une série en séance (CM-68).
//
// Toute la logique de priorité est centralisée ici, dans des fonctions pures et
// testables : aucune mutation, aucun effet de bord, aucune dépendance React.

import { formatWeight } from "@/lib/utils/training";

export type SetValue = { weight: string; reps: string };

export type ResolvePrefillInput = {
  /** Priorité 1 : valeur saisie par l'utilisateur, jamais écrasée. */
  touched: boolean;
  /** Valeur actuelle de la série, renvoyée telle quelle si `touched`. */
  current: SetValue;
  /**
   * Priorité 2 : série précédente effective (hors échauffement) du même
   * exercice dans la séance en cours. `null` si aucune — ou si la seule série
   * précédente est un échauffement, qui ne propage jamais vers une série
   * effective.
   */
  previousEffectiveSet: SetValue | null;
  /** La série concernée est-elle la série 1 (première série de l'exercice) ? */
  isFirstSet: boolean;
  /**
   * Priorités 3 & 4 : suggestion de charge (ressenti CM-50) puis, à défaut,
   * dernière séance sur cet exercice (CM-19). Uniquement applicable à la
   * série 1, `null` pour les séries suivantes.
   */
  firstSetSuggestion: SetValue | null;
};

/**
 * Résout la valeur de pré-remplissage d'une série selon l'ordre de priorité
 * CM-68, du plus prioritaire au moins prioritaire :
 *
 *   1. Valeur saisie par l'utilisateur (`touched`) — jamais écrasée.
 *   2. Série précédente du même exercice dans la séance en cours.
 *   3. Suggestion de charge selon le ressenti (série 1 uniquement).
 *   4. Dernière séance sur cet exercice (série 1 uniquement).
 *   5. Vide.
 *
 * Les priorités 3 et 4 sont pré-calculées en amont dans `firstSetSuggestion`
 * (cf. `suggestFirstSet`) : le serveur choisit la suggestion applicable et la
 * transmet déjà résolue.
 */
export function resolvePrefill(input: ResolvePrefillInput): SetValue {
  if (input.touched) return input.current; // 1
  if (input.previousEffectiveSet) return input.previousEffectiveSet; // 2
  if (input.isFirstSet && input.firstSetSuggestion) {
    return input.firstSetSuggestion; // 3 & 4
  }
  return { weight: "", reps: "" }; // 5
}

/**
 * Suggestion de charge pour la série 1 (priorités 3 & 4), à partir de la
 * dernière séance sur l'exercice. Reprend la surcharge progressive de CM-19 :
 * si la dernière fois on a atteint le haut de la fourchette de reps, on propose
 * +2,5 kg en repartant du bas de la fourchette ; sinon on reprend la dernière
 * perf à l'identique. Renvoie `null` s'il n'y a aucun historique.
 */
export function suggestFirstSet(
  last: { sets: { weight_kg: number; reps: number }[] } | null,
  targetRepsMin: number,
  targetRepsMax: number,
): SetValue | null {
  const ls = last?.sets[0];
  if (!ls) return null;
  const hitTop = targetRepsMax > 0 && ls.reps >= targetRepsMax;
  const weight = hitTop ? ls.weight_kg + 2.5 : ls.weight_kg;
  const reps = hitTop ? Math.max(1, targetRepsMin) : ls.reps;
  return { weight: formatWeight(weight), reps: String(reps) };
}
