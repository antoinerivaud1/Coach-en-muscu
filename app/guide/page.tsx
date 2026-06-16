import { createClient } from "@/lib/supabase/server";
import { requireProfileId, getCoupleId } from "@/lib/profile";
import { getCatalogExercises } from "@/lib/queries/exercises";
import type { SystemExercise } from "@/lib/queries/exercises";
import { MUSCLE_GROUP_LABELS } from "@/lib/utils/training";
import BottomNav from "@/components/BottomNav";
import ExerciseInfo from "@/components/ExerciseInfo";

const GROUP_ORDER = [
  "chest",
  "back",
  "shoulders",
  "biceps",
  "triceps",
  "quads",
  "hamstrings",
  "glutes",
  "calves",
  "core",
  "other",
];

export default async function GuidePage() {
  const profileId = await requireProfileId();
  const supabase = await createClient();
  const coupleId = await getCoupleId(supabase, profileId);

  const { data } = await getCatalogExercises(supabase, coupleId);
  const exercises: SystemExercise[] = data ?? [];

  const byGroup: Record<string, SystemExercise[]> = {};
  for (const ex of exercises) {
    (byGroup[ex.muscle_group] ??= []).push(ex);
  }
  const groups = GROUP_ORDER.filter((g) => byGroup[g]?.length);

  return (
    <main className="min-h-screen p-4 pb-28">
      <div className="mx-auto max-w-lg">
        <h1 className="text-2xl font-bold">Guide des exercices</h1>
        <p className="mt-1 text-sm text-zinc-400">
          Touche un exercice pour voir comment l&apos;exécuter, ce qu&apos;il
          faut éviter, et comment étirer le muscle.
        </p>

        {groups.map((group) => (
          <div key={group}>
            <h2 className="mb-2 mt-6 text-xs font-semibold uppercase tracking-wide text-zinc-500">
              {MUSCLE_GROUP_LABELS[group] ?? group}
            </h2>
            <div className="space-y-2">
              {byGroup[group]!.map((ex) => (
                <ExerciseInfo
                  key={ex.id}
                  name={ex.name}
                  muscleGroup={ex.muscle_group}
                  triggerClassName="flex w-full items-center justify-between rounded-lg bg-zinc-900 px-4 py-3 text-left active:bg-zinc-800"
                >
                  <span className="text-sm">{ex.name}</span>
                  <span className="text-lg text-zinc-500" aria-hidden>
                    ›
                  </span>
                </ExerciseInfo>
              ))}
            </div>
          </div>
        ))}
      </div>
      <BottomNav />
    </main>
  );
}
