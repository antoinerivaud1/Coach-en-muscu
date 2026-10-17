"use client";

import { isCustomExercise, type SystemExercise } from "@/lib/queries/exercises";
import { MUSCLE_GROUP_LABELS } from "@/lib/utils/training";
import { useRequireProfileId } from "@/hooks/useProfileId";
import { useCatalogExercises } from "@/hooks/data/useCatalogExercises";
import ExerciseInfo from "@/components/ExerciseInfo";
import OfflineBanner from "@/components/OfflineBanner";
import { ScreenError, ScreenSkeleton } from "@/components/ScreenState";

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

/**
 * Guide des exercices. CM-88 : premier écran converti en composant client
 * (écran pilote du socle) : session lue dans le navigateur, catalogue lu sous
 * RLS via `useCatalogExercises`, squelette au premier chargement.
 */
export default function GuideScreen() {
  const auth = useRequireProfileId("/guide");
  const catalog = useCatalogExercises(auth.profileId);

  return (
    <div className="mx-auto max-w-lg">
      <h1 className="text-2xl font-bold">Guide des exercices</h1>
      <p className="mt-1 text-sm text-fg-muted">
        Touche un exercice pour voir comment l&apos;exécuter, ce qu&apos;il
        faut éviter, et comment étirer le muscle.
      </p>
      <div className="mt-6">
        {auth.error ? (
          <ScreenError onRetry={() => void auth.refetch()} />
        ) : catalog.error && !catalog.data ? (
          <ScreenError onRetry={() => void catalog.refetch()} />
        ) : auth.isPending || !catalog.data ? (
          <ScreenSkeleton label="Chargement des exercices" />
        ) : (
          <>
            {/* CM-90 (PR 3) : rafraîchissement en échec, données gardées. */}
            <OfflineBanner sources={[catalog]} className="mb-4" />
            <ExerciseGroups exercises={catalog.data} />
          </>
        )}
      </div>
    </div>
  );
}

function ExerciseGroups({ exercises }: { exercises: SystemExercise[] }) {
  const byGroup: Record<string, SystemExercise[]> = {};
  for (const ex of exercises) {
    (byGroup[ex.muscle_group] ??= []).push(ex);
  }
  const groups = GROUP_ORDER.filter((g) => byGroup[g]?.length);

  return (
    <>
      {groups.map((group, i) => (
        <div key={group}>
          <h2
            className={`mb-2 text-xs font-semibold uppercase tracking-[0.03em] text-fg-muted ${i === 0 ? "" : "mt-6"}`}
          >
            {MUSCLE_GROUP_LABELS[group] ?? group}
          </h2>
          <div className="space-y-2">
            {byGroup[group]!.map((ex) => (
              <ExerciseInfo
                key={ex.id}
                name={ex.name}
                muscleGroup={ex.muscle_group}
                isCompound={ex.is_compound}
                isCustom={isCustomExercise(ex)}
                triggerClassName="flex w-full items-center justify-between rounded-lg bg-surface px-4 py-3 text-left active:bg-surface2"
              >
                <span className="text-base">{ex.name}</span>
                <span className="text-lg text-fg-muted" aria-hidden>
                  ›
                </span>
              </ExerciseInfo>
            ))}
          </div>
        </div>
      ))}
    </>
  );
}
