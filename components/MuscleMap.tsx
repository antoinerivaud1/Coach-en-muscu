"use client";

// Carte anatomique des muscles sollicités (face + dos).
// Primaire = rouge vif, secondaire = rouge clair.
// Silhouettes anatomiques : react-body-highlighter (licence MIT).
import Model, { type IExerciseData } from "react-body-highlighter";
import { getExerciseMuscles } from "@/lib/exerciseMuscles";

const BODY = "#3f3f46"; // zinc-700
const SECONDARY = "#fca5a5"; // red-300
const PRIMARY = "#ef4444"; // red-500

export default function MuscleMap({
  name,
  muscleGroup,
}: {
  name: string;
  muscleGroup: string;
}) {
  const { primary, secondary } = getExerciseMuscles(name, muscleGroup);

  // fréquence 1 -> rouge clair (secondaire), fréquence 2 -> rouge vif (primaire)
  const data: IExerciseData[] = [];
  if (secondary.length) data.push({ name: "sec", muscles: secondary, frequency: 1 });
  if (primary.length) data.push({ name: "prim", muscles: primary, frequency: 2 });

  const common = {
    data,
    bodyColor: BODY,
    highlightedColors: [SECONDARY, PRIMARY],
    svgStyle: { width: "100%", height: "100%" },
  };

  return (
    <div>
      <div className="flex items-stretch justify-center gap-4">
        <figure className="m-0 flex flex-col items-center">
          <div className="h-40 w-24">
            <Model type="anterior" {...common} />
          </div>
          <figcaption className="mt-1 text-[10px] font-medium text-zinc-500">
            Face
          </figcaption>
        </figure>
        <figure className="m-0 flex flex-col items-center">
          <div className="h-40 w-24">
            <Model type="posterior" {...common} />
          </div>
          <figcaption className="mt-1 text-[10px] font-medium text-zinc-500">
            Dos
          </figcaption>
        </figure>
      </div>
      <div className="mt-1 flex items-center justify-center gap-4 text-[10px] text-zinc-400">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: PRIMARY }} />
          Principal
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: SECONDARY }} />
          Secondaire
        </span>
      </div>
    </div>
  );
}
