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
import type { ExerciseSeries } from "@/components/progress/ProgressView";
import type { StatsData } from "@/components/progress/StatsSummary";

/**
 * CM-88 : lecture de l'écran Stats (progression) côté client, sous RLS.
 * Mêmes requêtes et mêmes calculs que l'ancienne page serveur ; une lecture
 * en échec LÈVE (l'écran affiche `ScreenError`, jamais des stats à zéro qui
 * se confondraient avec « aucune séance »).
 */

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

  const selectedProfileId =
    requestedProfileId && ids.includes(requestedProfileId)
      ? requestedProfileId
      : profileId;
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
  const thisMonday = startOfWeek(now);
  const { data: weekSess, error: weekError } = await getCompletedSessionsSince(
    supabase,
    ids,
    thisMonday.toISOString(),
  );
  if (weekError) throw new Error(READ_ERROR);

  // Comparaison du duo : seulement en duo actif (inchangé).
  let weekSetSessionIds: string[] = [];
  if (showsComparison(members) && (weekSess?.length ?? 0) > 0) {
    const { data: wkSets, error } = await supabase
      .from("session_sets")
      .select("session_id")
      .in(
        "session_id",
        (weekSess ?? []).map((s) => s.id),
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
      weekSessions: weekSess ?? [],
      weekSetSessionIds,
      now,
    }),
  };
}

/** Lundi 0 h (heure locale) de la semaine de `d`. */
function startOfWeek(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  const dow = (x.getDay() + 6) % 7;
  x.setDate(x.getDate() - dow);
  return x;
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

/** Statistiques résumées du profil affiché. */
export function buildStats(input: {
  allSets: ProgressRow[];
  names: Record<string, string>;
  muscleByEx: Record<string, string>;
  weekGoal: number;
  selectedProfileId: string;
  members: Member[];
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

  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  let sessionsThisMonth = 0;
  let sessionsLastMonth = 0;
  for (const at of sessionPerformedAt.values()) {
    const d = new Date(at);
    if (d >= monthStart) sessionsThisMonth++;
    else if (d >= prevMonthStart) sessionsLastMonth++;
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

  const thisMonday = startOfWeek(now);
  const weekBuckets: { start: number; label: string; volume: number }[] = [];
  for (let i = 5; i >= 0; i--) {
    const wkStart = new Date(thisMonday);
    wkStart.setDate(wkStart.getDate() - 7 * i);
    weekBuckets.push({
      start: wkStart.getTime(),
      label: `${wkStart.getDate()}/${wkStart.getMonth() + 1}`,
      volume: 0,
    });
  }
  for (const r of allSets) {
    const at = r.sessions?.performed_at;
    if (!at) continue;
    const ws = startOfWeek(new Date(at)).getTime();
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
