import type { BrowserSupabase } from "@/lib/supabase/client";
import { getMemberProfiles, type Profile } from "@/lib/queries/profiles";
import {
  getAllSetsForProgress,
  getCompletedSessionsSince,
  type ProgressRow,
  type WeekSessionRow,
} from "@/lib/queries/sessions";
import { showsComparison, toMembers, type Member } from "@/lib/duo";
import {
  bestE1RM,
  topWeight,
  formatDateShort,
  estimatedOneRepMax,
} from "@/lib/utils/training";
import {
  APP_TIME_ZONE,
  localDayNumber,
  localWeekdayIndex,
} from "@/lib/utils/recommendation";

/**
 * CM-88 : lecture de l'écran Stats (progression) côté client, sous RLS.
 * Mêmes requêtes et mêmes agrégats que l'ancienne page serveur, avec une
 * correction volontaire : semaines, mois et dates sont calculés dans
 * `APP_TIME_ZONE` (Europe/Paris, convention de l'accueil) et non plus dans le
 * fuseau de la machine (UTC sur Vercel). Une lecture en échec LÈVE (l'écran
 * affiche `ScreenError`, jamais des stats à zéro qui se confondraient avec
 * « aucune séance »).
 */

export type ExerciseSeries = {
  exercise_id: string;
  name: string;
  points: { label: string; topWeight: number; e1rm: number }[];
};

export type StatsData = {
  sessionsThisMonth: number;
  sessionsDelta: number;
  totalVolumeKg: number;
  totalSets: number;
  recordE1rm: number;
  recordExercise: string;
  weeks: { label: string; volume: number }[];
  groups: { group: string; pct: number }[];
  weekGoal: number;
  weekSessions: number;
  /** CM-87 : membres du duo (prénom, couleur) ; vide sans duo. */
  couple: { name: string; color: string; sets: number }[];
};

export type ProgressData = {
  members: Member[];
  /** Profil affiché : `?profile=` s'il est membre de mon duo actif, sinon moi. */
  selectedProfileId: string;
  /** Couleur du membre affiché. */
  color: string;
  hasSets: boolean;
  series: ExerciseSeries[];
  stats: StatsData;
};

const DEFAULT_COLOR = "#2FE6FF";
const READ_ERROR = "Impossible de charger tes statistiques.";
const MS_PER_DAY = 24 * 60 * 60 * 1000;

// ---- Calendrier en heure de Paris ------------------------------------------

/** Numéro de jour (cf. `localDayNumber`) du lundi de la semaine de `date`, à Paris. */
export function mondayDayNumber(date: Date): number {
  return localDayNumber(date) - localWeekdayIndex(date);
}

const monthPartsFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: APP_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
});

/** Mois absolu (année × 12 + mois) de `date`, à Paris. */
export function localMonthIndex(date: Date): number {
  const parts = monthPartsFormatter.formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes): number =>
    Number(parts.find((p) => p.type === type)?.value ?? Number.NaN);
  return part("year") * 12 + part("month") - 1;
}

/** Libellé « j/m » d'un numéro de jour (date civile, donc lue en UTC). */
function dayLabel(dayNumber: number): string {
  const d = new Date(dayNumber * MS_PER_DAY);
  return `${d.getUTCDate()}/${d.getUTCMonth() + 1}`;
}

// ---- Profil affiché ---------------------------------------------------------

/**
 * `?profile=` n'est retenu que s'il désigne un membre affiché (moi ou mon
 * partenaire de duo actif, éventuellement en ligne neutre si son profil est
 * illisible) ; sinon, et sans membre connu, c'est moi.
 */
export function pickSelectedProfile(
  members: readonly Pick<Member, "id">[],
  requested: string | null,
  me: string,
): string {
  return requested && members.some((m) => m.id === requested) ? requested : me;
}

// ---- Lecture -----------------------------------------------------------------

export async function fetchProgress(
  supabase: BrowserSupabase,
  profileId: string,
  requestedProfileId: string | null,
  now: Date = new Date(),
): Promise<ProgressData> {
  // CM-87 : moi, plus mon partenaire en duo actif, avec prénom et couleur.
  const { profiles } = await getMemberProfiles(supabase, profileId);
  const members = toMembers(profiles, profileId);
  const ids = members.map((m) => m.id);

  const selectedProfileId = pickSelectedProfile(members, requestedProfileId, profileId);
  const selectedProfile: Profile | null =
    profiles.find((p) => p.id === selectedProfileId) ?? null;
  const selectedMember =
    members.find((m) => m.id === selectedProfileId) ?? members[0];
  const color = selectedMember?.color ?? DEFAULT_COLOR;

  const { data: setsData, error: setsError } = await getAllSetsForProgress(
    supabase,
    selectedProfileId,
  );
  if (setsError) throw new Error(READ_ERROR);
  const allSets = setsData ?? [];

  // Noms et groupes musculaires des exercices.
  const exerciseIds = Array.from(new Set(allSets.map((s) => s.exercise_id)));
  const names: Record<string, string> = {};
  const muscleByEx: Record<string, string> = {};
  if (exerciseIds.length > 0) {
    const { data: exData, error } = await supabase
      .from("exercises")
      .select("id, name, muscle_group")
      .in("id", exerciseIds)
      .returns<{ id: string; name: string; muscle_group: string }[]>();
    if (error) throw new Error(READ_ERROR);
    for (const ex of exData ?? []) {
      names[ex.id] = ex.name;
      muscleByEx[ex.id] = ex.muscle_group;
    }
  }

  // Objectif hebdo : séances TERMINÉES seulement. L'anneau d'objectif et la
  // comparaison du duo ne doivent pas compter une séance encore ouverte (CM-83).
  // Lecture large (depuis le dimanche 0 h UTC, toujours avant le lundi 0 h à
  // Paris), puis filtre exact sur le lundi de Paris.
  const monday = mondayDayNumber(now);
  const { data: weekSessData, error: weekError } = await getCompletedSessionsSince(
    supabase,
    ids,
    new Date((monday - 1) * MS_PER_DAY).toISOString(),
  );
  if (weekError) throw new Error(READ_ERROR);
  const weekSess = filterSinceMonday(weekSessData ?? [], now);

  // Comparaison du duo : seulement en duo actif (inchangé).
  let weekSetSessionIds: string[] = [];
  if (showsComparison(members) && weekSess.length > 0) {
    const { data: wkSets, error } = await supabase
      .from("session_sets")
      .select("session_id")
      .in(
        "session_id",
        weekSess.map((s) => s.id),
      )
      .returns<{ session_id: string }[]>();
    if (error) throw new Error(READ_ERROR);
    weekSetSessionIds = (wkSets ?? []).map((r) => r.session_id);
  }

  return {
    members,
    selectedProfileId,
    color,
    hasSets: allSets.length > 0,
    series: buildSeries(allSets, names),
    stats: buildStats({
      allSets,
      names,
      muscleByEx,
      weekGoal: selectedProfile?.weekly_goal ?? 4,
      selectedProfileId,
      members,
      weekSessions: weekSess,
      weekSetSessionIds,
      now,
    }),
  };
}

/** Séances faites depuis le lundi 0 h (heure de Paris) de la semaine de `now`. */
export function filterSinceMonday<T extends { performed_at: string }>(
  sessions: T[],
  now: Date,
): T[] {
  const monday = mondayDayNumber(now);
  return sessions.filter((s) => localDayNumber(new Date(s.performed_at)) >= monday);
}

/** Courbes par exercice : une valeur par séance, triées par date. */
export function buildSeries(
  allSets: ProgressRow[],
  names: Record<string, string>,
): ExerciseSeries[] {
  type Agg = { performedAt: string; sets: { weight_kg: number; reps: number }[] };
  const byExercise: Record<string, Record<string, Agg>> = {};
  for (const row of allSets) {
    const performedAt = row.sessions?.performed_at;
    if (!performedAt) continue;
    const exMap = (byExercise[row.exercise_id] ??= {});
    const agg = (exMap[row.session_id] ??= { performedAt, sets: [] });
    agg.sets.push({ weight_kg: row.weight_kg, reps: row.reps });
  }

  return Object.entries(byExercise)
    .map(([exId, sessionsMap]) => {
      const points = Object.values(sessionsMap)
        .sort((a, b) => a.performedAt.localeCompare(b.performedAt))
        .map((agg) => ({
          label: formatDateShort(agg.performedAt),
          topWeight: topWeight(agg.sets),
          e1rm: bestE1RM(agg.sets),
        }));
      return { exercise_id: exId, name: names[exId] ?? "Exercice", points };
    })
    .sort((a, b) => b.points.length - a.points.length);
}

/** Statistiques résumées du profil affiché (calendrier de Paris). */
export function buildStats(input: {
  allSets: ProgressRow[];
  names: Record<string, string>;
  muscleByEx: Record<string, string>;
  weekGoal: number;
  selectedProfileId: string;
  members: Member[];
  /** Séances terminées depuis le lundi de Paris (cf. `filterSinceMonday`). */
  weekSessions: WeekSessionRow[];
  /** `session_id` de chaque série des séances de la semaine (duo actif seulement). */
  weekSetSessionIds: string[];
  now: Date;
}): StatsData {
  const { allSets, names, muscleByEx, now } = input;

  const sessionPerformedAt = new Map<string, string>();
  for (const r of allSets) {
    const at = r.sessions?.performed_at;
    if (at) sessionPerformedAt.set(r.session_id, at);
  }

  const thisMonth = localMonthIndex(now);
  let sessionsThisMonth = 0;
  let sessionsLastMonth = 0;
  for (const at of sessionPerformedAt.values()) {
    const month = localMonthIndex(new Date(at));
    if (month >= thisMonth) sessionsThisMonth++;
    else if (month === thisMonth - 1) sessionsLastMonth++;
  }

  let totalVolumeKg = 0;
  let recordE1rm = 0;
  let recordExercise = "";
  const volumeByGroup: Record<string, number> = {};
  for (const r of allSets) {
    const vol = r.weight_kg * r.reps;
    totalVolumeKg += vol;
    const e = estimatedOneRepMax(r.weight_kg, r.reps);
    if (e > recordE1rm) {
      recordE1rm = e;
      recordExercise = names[r.exercise_id] ?? "";
    }
    const g = muscleByEx[r.exercise_id] ?? "other";
    volumeByGroup[g] = (volumeByGroup[g] ?? 0) + vol;
  }

  // 6 dernières semaines (lundi de Paris), la plus ancienne d'abord.
  const thisMonday = mondayDayNumber(now);
  const weekBuckets: { start: number; label: string; volume: number }[] = [];
  for (let i = 5; i >= 0; i--) {
    const start = thisMonday - 7 * i;
    weekBuckets.push({ start, label: dayLabel(start), volume: 0 });
  }
  for (const r of allSets) {
    const at = r.sessions?.performed_at;
    if (!at) continue;
    const ws = mondayDayNumber(new Date(at));
    const bucket = weekBuckets.find((b) => b.start === ws);
    if (bucket) bucket.volume += r.weight_kg * r.reps;
  }

  const groupsTotal = Object.values(volumeByGroup).reduce((a, b) => a + b, 0);
  const groups = Object.entries(volumeByGroup)
    .map(([group, vol]) => ({
      group,
      pct: groupsTotal > 0 ? Math.round((vol / groupsTotal) * 100) : 0,
    }))
    .filter((g) => g.pct > 0)
    .sort((a, b) => b.pct - a.pct);

  const weekSessions = input.weekSessions.filter(
    (s) => s.profile_id === input.selectedProfileId,
  ).length;

  let couple: StatsData["couple"] = [];
  if (showsComparison(input.members) && input.weekSessions.length > 0) {
    const sessToProfile = new Map(
      input.weekSessions.map((s) => [s.id, s.profile_id]),
    );
    const cnt: Record<string, number> = {};
    for (const sessionId of input.weekSetSessionIds) {
      const pid = sessToProfile.get(sessionId);
      if (pid) cnt[pid] = (cnt[pid] ?? 0) + 1;
    }
    couple = input.members.map((m) => ({
      name: m.name,
      color: m.color,
      sets: cnt[m.id] ?? 0,
    }));
  }

  return {
    sessionsThisMonth,
    sessionsDelta: sessionsThisMonth - sessionsLastMonth,
    totalVolumeKg,
    totalSets: allSets.length,
    recordE1rm,
    recordExercise,
    weeks: weekBuckets.map((b) => ({ label: b.label, volume: b.volume })),
    groups,
    weekGoal: input.weekGoal,
    weekSessions,
    couple,
  };
}
