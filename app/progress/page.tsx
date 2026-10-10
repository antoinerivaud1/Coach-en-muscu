import { createClient } from "@/lib/supabase/server";
import { requireProfileId, getMemberProfiles } from "@/lib/profile";
import { memberStyle, showsComparison, toMembers } from "@/lib/duo";
import {
  getAllSetsForProgress,
  getCompletedSessionsSince,
} from "@/lib/queries/sessions";
import type { ProgressRow } from "@/lib/queries/sessions";
import {
  bestE1RM,
  topWeight,
  formatDateShort,
  estimatedOneRepMax,
} from "@/lib/utils/training";
import BottomNav from "@/components/BottomNav";
import ProgressView, { type ExerciseSeries } from "./ProgressView";
import StatsSummary, { type StatsData } from "./StatsSummary";

export default async function ProgressPage({
  searchParams,
}: {
  searchParams: Promise<{ profile?: string }>;
}) {
  const { profile: profileParam } = await searchParams;
  const profileId = await requireProfileId("/progress");
  const supabase = await createClient();

  // CM-87 : moi, plus mon partenaire en duo actif, avec prénom et couleur.
  const { profiles } = await getMemberProfiles(supabase, profileId);
  const members = toMembers(profiles, profileId);
  const ids = members.map((m) => m.id);

  const selectedProfileId =
    profileParam && ids.includes(profileParam) ? profileParam : profileId;
  const selectedProfile =
    profiles.find((p) => p.id === selectedProfileId) ?? null;
  const selectedMember = members.find((m) => m.id === selectedProfileId) ?? members[0];
  const color = selectedMember?.color ?? "#2FE6FF";

  const { data: setsData } = await getAllSetsForProgress(
    supabase,
    selectedProfileId,
  );
  const allSets = (setsData ?? []) as ProgressRow[];

  // Noms d'exercices.
  const exerciseIds = Array.from(new Set(allSets.map((s) => s.exercise_id)));
  const names: Record<string, string> = {};
  const muscleByEx: Record<string, string> = {};
  if (exerciseIds.length > 0) {
    const { data: exData } = await supabase
      .from("exercises")
      .select("id, name, muscle_group")
      .in("id", exerciseIds)
      .returns<{ id: string; name: string; muscle_group: string }[]>();
    for (const ex of exData ?? []) {
      names[ex.id] = ex.name;
      muscleByEx[ex.id] = ex.muscle_group;
    }
  }

  // Groupe par exercice puis par séance.
  type Agg = { performedAt: string; sets: { weight_kg: number; reps: number }[] };
  const byExercise: Record<string, Record<string, Agg>> = {};
  for (const row of allSets) {
    const performedAt = row.sessions?.performed_at;
    if (!performedAt) continue;
    const exMap = (byExercise[row.exercise_id] ??= {});
    const agg = (exMap[row.session_id] ??= { performedAt, sets: [] });
    agg.sets.push({ weight_kg: row.weight_kg, reps: row.reps });
  }

  const series: ExerciseSeries[] = Object.entries(byExercise)
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

  // ----- Statistiques résumées (profil sélectionné) -----
  const sessionPerformedAt = new Map<string, string>();
  for (const r of allSets) {
    const at = r.sessions?.performed_at;
    if (at) sessionPerformedAt.set(r.session_id, at);
  }

  const now = new Date();
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
  const totalSets = allSets.length;

  const startOfWeek = (d: Date) => {
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    const dow = (x.getDay() + 6) % 7;
    x.setDate(x.getDate() - dow);
    return x;
  };
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

  // Objectif hebdo (nb de séances cette semaine) + comparaison couple
  const WEEK_GOAL = selectedProfile?.weekly_goal ?? 4;
  // Séances TERMINÉES seulement : l'anneau d'objectif et la comparaison du
  // couple ne doivent pas compter une séance encore ouverte (CM-83).
  const { data: weekSess } = await getCompletedSessionsSince(
    supabase,
    ids,
    new Date(thisMonday).toISOString(),
  );
  const weekSessions = (weekSess ?? []).filter(
    (s) => s.profile_id === selectedProfileId,
  ).length;
  let couple: { name: string; color: string; sets: number }[] = [];
  if (showsComparison(members) && (weekSess?.length ?? 0) > 0) {
    const sessToProfile = new Map(
      (weekSess ?? []).map((s) => [s.id, s.profile_id]),
    );
    const { data: wkSets } = await supabase
      .from("session_sets")
      .select("session_id")
      .in(
        "session_id",
        (weekSess ?? []).map((s) => s.id),
      )
      .returns<{ session_id: string }[]>();
    const cnt: Record<string, number> = {};
    for (const r of wkSets ?? []) {
      const pid = sessToProfile.get(r.session_id);
      if (pid) cnt[pid] = (cnt[pid] ?? 0) + 1;
    }
    couple = members.map((m) => ({
      name: m.name,
      color: m.color,
      sets: cnt[m.id] ?? 0,
    }));
  }

  const stats: StatsData = {
    sessionsThisMonth,
    sessionsDelta: sessionsThisMonth - sessionsLastMonth,
    totalVolumeKg,
    totalSets,
    recordE1rm,
    recordExercise,
    weeks: weekBuckets.map((b) => ({ label: b.label, volume: b.volume })),
    groups,
    weekGoal: WEEK_GOAL,
    weekSessions,
    couple,
  };

  return (
    <main
      className="min-h-[100dvh] p-4 pb-28 pt-[max(1rem,env(safe-area-inset-top))]"
      style={memberStyle(color)}
    >
      <div className="mx-auto max-w-lg">
        <h1 className="text-3xl font-black tracking-tight">Progression</h1>

        {showsComparison(members) && (
          <div className="mt-3 flex gap-2">
            {members.map((m) => {
              const active = m.id === selectedProfileId;
              return (
                <a
                  key={m.id}
                  href={`/progress?profile=${m.id}`}
                  aria-current={active ? "page" : undefined}
                  className={`inline-flex min-h-11 items-center rounded-full px-4 text-sm font-bold ${
                    active ? "text-ink" : "bg-surface2 text-fg-muted"
                  }`}
                  style={active ? { background: m.color } : undefined}
                >
                  {m.name}
                </a>
              );
            })}
          </div>
        )}

        {allSets.length > 0 && (
          <StatsSummary stats={stats} color={color} />
        )}

        <ProgressView series={series} color={color} />
      </div>
      <BottomNav />
    </main>
  );
}
