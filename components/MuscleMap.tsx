"use client";

// Carte anatomique du muscle ciblé (face + dos), surligné en rouge.
// Silhouettes anatomiques fournies par react-body-highlighter (licence MIT).
import Model, {
  type IExerciseData,
  type Muscle,
} from "react-body-highlighter";

// muscle_group (app) -> muscles à surligner sur chaque vue.
const FRONT: Record<string, Muscle[]> = {
  chest: ["chest"],
  shoulders: ["front-deltoids"],
  biceps: ["biceps"],
  quads: ["quadriceps"],
  core: ["abs", "obliques"],
};

const BACK: Record<string, Muscle[]> = {
  back: ["upper-back", "lower-back"],
  shoulders: ["back-deltoids"],
  triceps: ["triceps"],
  hamstrings: ["hamstring"],
  glutes: ["gluteal"],
  calves: ["calves"],
};

const BODY = "#3f3f46"; // zinc-700
const HI = "#ef4444"; // red-500

export default function MuscleMap({ muscleGroup }: { muscleGroup: string }) {
  const front = FRONT[muscleGroup] ?? [];
  const back = BACK[muscleGroup] ?? [];

  const frontData: IExerciseData[] = front.length
    ? [{ name: "ciblé", muscles: front }]
    : [];
  const backData: IExerciseData[] = back.length
    ? [{ name: "ciblé", muscles: back }]
    : [];

  const common = {
    bodyColor: BODY,
    highlightedColors: [HI],
    svgStyle: { width: "100%", height: "100%" },
  };

  return (
    <div className="flex items-stretch justify-center gap-4">
      <figure className="m-0 flex flex-col items-center">
        <div className="h-40 w-24">
          <Model type="anterior" data={frontData} {...common} />
        </div>
        <figcaption className="mt-1 text-[10px] font-medium text-zinc-500">
          Face
        </figcaption>
      </figure>
      <figure className="m-0 flex flex-col items-center">
        <div className="h-40 w-24">
          <Model type="posterior" data={backData} {...common} />
        </div>
        <figcaption className="mt-1 text-[10px] font-medium text-zinc-500">
          Dos
        </figcaption>
      </figure>
    </div>
  );
}
