"use client";

// Version compacte de la carte musculaire, dans la carte d'exercice en séance
// (CM-30) : mini silhouette face et dos, principaux et secondaires.
import { useSilhouette } from "@/hooks/useSilhouette";
import MuscleMap from "@/components/MuscleMap";
import MuscleLegend from "@/components/MuscleLegend";

export default function ExerciseMuscleSummary({
  name,
  muscleGroup,
  colorRole,
}: {
  name: string;
  muscleGroup: string;
  colorRole?: "toi" | "elle" | null;
}) {
  const [silhouette] = useSilhouette(colorRole);
  return (
    <div className="mt-3 flex items-center gap-3 rounded-xl bg-surface/50 px-3 py-2.5">
      <div className="w-[156px] flex-none">
        <MuscleMap name={name} muscleGroup={muscleGroup} silhouette={silhouette} size="compact" />
      </div>
      <div className="min-w-0 flex-1">
        <MuscleLegend name={name} muscleGroup={muscleGroup} compact />
      </div>
    </div>
  );
}
