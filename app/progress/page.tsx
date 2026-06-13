import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAllSetsForProgress } from "@/lib/queries/sessions";
import type { ProgressRow } from "@/lib/queries/sessions";
import {
  bestE1RM,
  topWeight,
  formatDateShort,
} from "@/lib/utils/training";
import BottomNav from "@/components/BottomNav";
import ProgressView, { type ExerciseSeries } from "./ProgressView";

type ProfileRow = { id: string; display_name: string; color_role: "toi" | "elle" };

export default async function ProgressPage({
  searchParams,
}: {
  searchParams: Promise<{ profile?: string }>;
}) {
  const { profile: profileParam } = await searchParams;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  // Profils accessibles (moi + partenaire).
  const { data: accessibleIds } = await supabase
    .rpc("accessible_profile_ids")
    .returns<string[]>();
  const ids = accessibleIds ?? [user.id];

  const { data: profilesData } = await supabase
    .from("profiles")
    .select("id, display_name, color_role")
    .in("id", ids)
    .returns<ProfileRow[]>();
  const profiles = profilesData ?? [];

  const selectedProfileId =
    profileParam && ids.includes(profileParam) ? profileParam : user.id;
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
  if (exerciseIds.length > 0) {
    const { data: exData } = await supabase
      .from("exercises")
      .select("id, name")
      .in("id", exerciseIds)
      .returns<{ id: string; name: string }[]>();
    for (const ex of exData ?? []) names[ex.id] = ex.name;
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

  return (
    <main className="min-h-screen p-4 pb-24">
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

        <ProgressView series={series} color={color} />
      </div>
      <BottomNav />
    </main>
  );
}
