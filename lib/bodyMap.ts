// Coloration des silhouettes (CM-30) : traduit les muscles d'un exercice
// (slugs react-body-highlighter, cf. exerciseMuscles.ts) vers les zones des
// tracés homme / femme (bodyMapPaths.ts), vue par vue.
import type { Muscle } from "react-body-highlighter";
import type { ExerciseMuscles } from "@/lib/exerciseMuscles";

export type BodyView = "front" | "back";

/** Rôle d'une zone : sollicitée (principal / secondaire), muscle au repos, ou hors muscle. */
export type ZoneRole = "primary" | "secondary" | "idle" | "base";

/** Zones des tracés qui ne sont pas des muscles (tête, mains, pieds...). */
const BASE_ZONES = new Set(["head", "hair", "neck", "hands", "feet", "ankles", "knees"]);

/**
 * Zone(s) des tracés pour un muscle, selon la vue. Les deltoïdes n'ont
 * qu'une zone par vue : antérieurs sur la face, postérieurs sur le dos.
 */
export function zonesFor(muscle: Muscle, view: BodyView): string[] {
  switch (muscle) {
    case "front-deltoids":
      return view === "front" ? ["deltoids"] : [];
    case "back-deltoids":
      return view === "back" ? ["deltoids"] : [];
    case "adductor":
      return ["adductors"];
    case "abductors":
      return ["gluteal"];
    case "left-soleus":
    case "right-soleus":
      return ["calves"];
    default:
      return [muscle];
  }
}

/** Rôle de chaque zone sollicitée dans une vue (principal prioritaire). */
export function zoneRoles(
  muscles: ExerciseMuscles,
  view: BodyView,
): Map<string, "primary" | "secondary"> {
  const roles = new Map<string, "primary" | "secondary">();
  for (const m of muscles.secondary) {
    for (const z of zonesFor(m, view)) roles.set(z, "secondary");
  }
  for (const m of muscles.primary) {
    for (const z of zonesFor(m, view)) roles.set(z, "primary");
  }
  return roles;
}

export function zoneRole(
  zone: string,
  roles: Map<string, "primary" | "secondary">,
): ZoneRole {
  return roles.get(zone) ?? (BASE_ZONES.has(zone) ? "base" : "idle");
}
