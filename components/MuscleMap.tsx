"use client";

// Carte anatomique des muscles sollicités, face et dos (CM-30).
// Principal en vert acide, secondaires en vert atténué, le reste en gris.
// Silhouettes homme / femme : tracés de react-native-body-highlighter (MIT),
// voir lib/bodyMapPaths.ts.
import { FEMALE_FIGURE, MALE_FIGURE, type BodyPath } from "@/lib/bodyMapPaths";
import { getExerciseMuscles } from "@/lib/exerciseMuscles";
import { zoneRole, zoneRoles, type BodyView, type ZoneRole } from "@/lib/bodyMap";
import type { Silhouette } from "@/lib/silhouette";

const FILL_CLASS: Record<ZoneRole, string> = {
  primary: "fill-energy",
  secondary: "fill-energy-dim",
  idle: "fill-body-idle",
  base: "fill-body-base",
};

function Figure({
  paths,
  viewBox,
  roles,
  label,
  caption,
  size,
}: {
  paths: readonly BodyPath[];
  viewBox: string;
  roles: Map<string, "primary" | "secondary">;
  label: string;
  caption: string;
  size: "full" | "compact";
}) {
  return (
    <figure className="m-0 flex min-w-0 flex-1 flex-col items-center gap-1.5">
      <svg
        viewBox={viewBox}
        role="img"
        aria-label={label}
        className={size === "full" ? "h-[300px] w-full max-w-[150px]" : "h-[150px] w-full max-w-[75px]"}
      >
        {paths.map(([slug, d], i) => (
          <path key={i} d={d} className={FILL_CLASS[zoneRole(slug, roles)]} />
        ))}
      </svg>
      <figcaption className="font-oswald text-[12px] font-semibold uppercase tracking-[0.12em] text-fg-muted">
        {caption}
      </figcaption>
    </figure>
  );
}

export default function MuscleMap({
  name,
  muscleGroup,
  silhouette,
  size = "full",
}: {
  name: string;
  muscleGroup: string;
  silhouette: Silhouette;
  size?: "full" | "compact";
}) {
  const muscles = getExerciseMuscles(name, muscleGroup);
  const figure = silhouette === "femme" ? FEMALE_FIGURE : MALE_FIGURE;
  const views: { view: BodyView; caption: string; paths: readonly BodyPath[]; viewBox: string }[] = [
    { view: "front", caption: "Face", paths: figure.front, viewBox: figure.viewBoxFront },
    { view: "back", caption: "Dos", paths: figure.back, viewBox: figure.viewBoxBack },
  ];

  return (
    <div className={`flex justify-center ${size === "full" ? "gap-2" : "gap-1"}`}>
      {views.map((v) => (
        <Figure
          key={v.view}
          paths={v.paths}
          viewBox={v.viewBox}
          roles={zoneRoles(muscles, v.view)}
          caption={v.caption}
          label={`Silhouette ${silhouette}, vue de ${v.view === "front" ? "face" : "dos"}, muscles sollicités en surbrillance`}
          size={size}
        />
      ))}
    </div>
  );
}
