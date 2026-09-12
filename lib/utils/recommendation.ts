// Tri par ancienneté et recommandation de séance de l'écran d'accueil (CM-66).
//
// Module PUR : aucune I/O, aucun import Supabase. Il ne connaît que des dates
// et des groupes musculaires, ce qui le rend testable sans base et réutilisable
// côté serveur comme côté client.
//
// Il remplace les deux systèmes concurrents de « séance du jour » : la rotation
// par nombre de séances (CM-39) et le planning daté par jour de semaine
// (CM-49, colonne `program_days.weekdays` supprimée en base par CM-69). Ici,
// rien n'est imposé : l'écran trie et suggère, l'utilisateur choisit.

import type { MuscleGroup } from "@/lib/utils/seances";

/** Une séance type de la bibliothèque, telle qu'affichée sur l'accueil. */
export type SeanceCard = {
  id: string;
  name: string;
  programName: string;
  exerciseCount: number;
  setCount: number;
  /** Groupe musculaire de CHAQUE exercice, répétitions comprises : c'est ce qui
   *  donne son poids au groupe dominant dans le calcul de recouvrement. */
  groups: MuscleGroup[];
  /** Date ISO de la dernière exécution effective, `null` si jamais faite. */
  lastDoneAt: string | null;
};

/** Une séance enregistrée, réduite aux groupes musculaires réellement travaillés. */
export type SessionHistoryEntry = {
  performedAt: string;
  groups: MuscleGroup[];
};

/**
 * Ancienneté attribuée à une séance jamais faite. Volontairement énorme devant
 * `MAX_OVERLAP_PENALTY_DAYS` : une séance jamais faite passe toujours devant,
 * quel que soit son recouvrement musculaire.
 */
export const NEVER_DONE_DAYS = 9999;

/** Fenêtre glissante servant à repérer les groupes musculaires déjà sollicités. */
export const BALANCE_WINDOW_DAYS = 7;

/** Pénalité maximale, en « jours d'ancienneté », d'un recouvrement musculaire total. */
export const MAX_OVERLAP_PENALTY_DAYS = 7;

/** En dessous de ce nombre de séances enregistrées, aucune suggestion n'est affichée. */
export const MIN_HISTORY_FOR_RECOMMENDATION = 2;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Fuseau de référence de l'app.
 *
 * L'accueil est un composant serveur : `setHours(0, 0, 0, 0)` y donnerait les
 * bornes de journée du SERVEUR, c'est-à-dire UTC sur Vercel, pas celles de
 * l'utilisateur. Une séance enregistrée un samedi à 1 h du matin
 * (`2026-09-05T23:00:00Z`) serait alors rattachée au vendredi — définitivement,
 * pas seulement à l'affichage : mauvais jour coché dans le strip de la semaine,
 * « Il y a n jours » décalé d'un jour, et fenêtre d'équilibre musculaire
 * calculée sur la mauvaise date.
 *
 * Le couple s'entraîne en France : les journées sont donc ancrées ici, une fois
 * pour toutes, plutôt que laissées à la merci du fuseau du runtime.
 */
export const APP_TIME_ZONE = "Europe/Paris";

const dayPartsFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: APP_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/**
 * Numéro de jour absolu (jours depuis l'époque) dans `APP_TIME_ZONE`.
 *
 * Passer par la date civile plutôt que par une soustraction de timestamps rend
 * le calcul exact aux changements d'heure : les journées de 23 h et 25 h n'ont
 * pas à être arrondies, elles ne sont jamais mesurées.
 */
export function localDayNumber(date: Date): number {
  const parts = dayPartsFormatter.formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes): number =>
    Number(parts.find((p) => p.type === type)?.value ?? Number.NaN);
  return Math.round(
    Date.UTC(part("year"), part("month") - 1, part("day")) / MS_PER_DAY,
  );
}

/** Index du jour dans la semaine dans `APP_TIME_ZONE`, lundi = 0. */
export function localWeekdayIndex(date: Date): number {
  // Le jour 0 de l'époque (1970-01-01) est un jeudi, soit l'index 3.
  return (((localDayNumber(date) + 3) % 7) + 7) % 7;
}

/**
 * Jours pleins écoulés depuis `iso`, comparés au DÉBUT de journée des deux
 * dates dans `APP_TIME_ZONE` : une séance faite hier soir compte pour 1 jour
 * même s'il s'est écoulé moins de 24 h. Jamais négatif : une date future
 * compte pour 0. Une date invalide compte pour 0 (aucune raison de la faire
 * remonter en tête de liste).
 */
export function daysSince(iso: string, now: Date): number {
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return 0;
  return Math.max(0, localDayNumber(now) - localDayNumber(then));
}

/** Ancienneté d'une séance, en jours. `NEVER_DONE_DAYS` si jamais faite. */
export function stalenessDays(seance: SeanceCard, now: Date): number {
  return seance.lastDoneAt === null
    ? NEVER_DONE_DAYS
    : daysSince(seance.lastDoneAt, now);
}

/** Libellé affiché sur chaque carte : « Jamais faite », « Aujourd'hui », « Hier », « Il y a n jours ». */
export function formatLastDone(lastDoneAt: string | null, now: Date): string {
  if (lastDoneAt === null) return "Jamais faite";
  const days = daysSince(lastDoneAt, now);
  if (days === 0) return "Aujourd'hui";
  if (days === 1) return "Hier";
  return `Il y a ${days} jours`;
}

/**
 * Tri STABLE de la plus ancienne à la plus récente. À ancienneté égale, l'ordre
 * d'entrée (celui de la bibliothèque) est conservé — d'où le
 * decorate-sort-undecorate sur l'index plutôt qu'un pari sur la stabilité du
 * moteur JS. Ne mute pas le tableau d'entrée.
 */
export function sortByStaleness(seances: SeanceCard[], now: Date): SeanceCard[] {
  return seances
    .map((seance, index) => ({ seance, index, staleness: stalenessDays(seance, now) }))
    .sort((a, b) => b.staleness - a.staleness || a.index - b.index)
    .map((entry) => entry.seance);
}

/** Groupes musculaires travaillés sur les `BALANCE_WINDOW_DAYS` derniers jours. */
export function recentMuscleGroups(
  history: SessionHistoryEntry[],
  now: Date,
): Set<MuscleGroup> {
  const recent = new Set<MuscleGroup>();
  for (const entry of history) {
    if (daysSince(entry.performedAt, now) >= BALANCE_WINDOW_DAYS) continue;
    for (const group of entry.groups) recent.add(group);
  }
  return recent;
}

/**
 * Score de recommandation : l'ancienneté, diminuée d'au plus
 * `MAX_OVERLAP_PENALTY_DAYS` proportionnellement à la part des exercices dont
 * le groupe a déjà été travaillé dans la fenêtre. Une séance sans exercice
 * renvoie son ancienneté brute (rien à recouvrir).
 */
export function recommendationScore(
  seance: SeanceCard,
  recentGroups: ReadonlySet<MuscleGroup>,
  now: Date,
): number {
  const staleness = stalenessDays(seance, now);
  if (seance.groups.length === 0) return staleness;
  const overlapping = seance.groups.filter((group) => recentGroups.has(group)).length;
  return staleness - (overlapping / seance.groups.length) * MAX_OVERLAP_PENALTY_DAYS;
}

/**
 * Séance suggérée, purement indicative : jamais verrouillée, jamais imposée.
 *
 * Renvoie `null` tant qu'il n'y a pas assez d'historique pour dire quoi que ce
 * soit d'utile, ou s'il y a moins de deux séances démarrables — suggérer la
 * seule séance possible n'apporte rien. À score égal, la première du tableau
 * gagne : passer un tableau déjà trié par ancienneté rend le choix déterministe.
 */
export function pickRecommendedSeance(
  seances: SeanceCard[],
  recentGroups: ReadonlySet<MuscleGroup>,
  loggedSessionCount: number,
  now: Date,
): SeanceCard | null {
  if (loggedSessionCount < MIN_HISTORY_FOR_RECOMMENDATION) return null;

  const startable = seances.filter((seance) => seance.exerciseCount > 0);
  if (startable.length < 2) return null;

  let best: SeanceCard | null = null;
  let bestScore = Number.NEGATIVE_INFINITY;
  for (const seance of startable) {
    const score = recommendationScore(seance, recentGroups, now);
    if (score > bestScore) {
      bestScore = score;
      best = seance;
    }
  }
  return best;
}
