import { createClient } from "@/lib/supabase/server";
import {
  requireProfileId,
  getCoupleId,
  getCoupleProfileIds,
} from "@/lib/profile";
import { getAllSetsForProgress } from "@/lib/queries/sessions";
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

type ProfileRow = { id: string; display_name: string; color_role: "toi" | "elle" };

export default async function ProgressPage({
  searchParams,
}: {
  searchParams: Promise<{ profile?: string }>;
}) {
  const { profile: profileParam } = await searchParams;
  const profileId = await requireProfileId();
  const supabase = await createClient();

  // Profils du couple (moi + partenaire).
  const coupleId = await getCoupleId(supabase, profileId);
  const ids = coupleId
    ? await getCoupleProfileIds(supabase, coupleId)
    : [profileId];

  const { data: profilesData } = await supabase
    .from("profiles")
    .select("id, display_name, color_role")
    .in("id", ids)
    .returns<ProfileRow[]>();
  const profiles = profilesData ?? [];

  const selectedProfileId =
    profileParam && ids.includes(profileParam) ? profileParam : profileId;
  const selectedProfile =
    profiles.find((p) => p.id === selectedProfileId) ?? null;
  const color = selectedProfile?.color_role === "elle" ? "#A855F7" : "#F97316";

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

  const stats: StatsData = {
    sessionsThisMonth,
    sessionsDelta: sessionsThisMonth - sessionsLastMonth,
    totalVolumeKg,
    totalSets,
    recordE1rm,
    recordExercise,
    weeks: weekBuckets.map((b) => ({ label: b.label, volume: b.volume })),
    groups,
  };

  return (
    <main className="min-h-screen p-4 pb-28">
      <div className="mx-auto max-w-lg">
        <h1 className="text-2xl font-bold">Progression</h1>

        {profiles.length > 1 && (
          <div className="mt-3 flex gap-2">
            {profiles.map((p) => {
              const active = p.id === selectedProfileId;
              const c = p.color_role === "elle" ? "elle" : "toi";
              return (
                <a
                  key={p.id}
                  href={`/progress?profile=${p.id}`}
                  className={`rounded-full px-3 py-1.5 text-sm font-medium ${
                    active
                      ? c === "elle"
                        ? "bg-elle text-white"
                        : "bg-toi text-white"
                      : "bg-zinc-800 text-zinc-400"
                  }`}
                >
                  {p.display_name}
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
