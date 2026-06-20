// Muscles sollicités par exercice (primaire = rouge vif, secondaire = rouge clair).
// Slugs anatomiques de react-body-highlighter. Mapping par nom d'exercice,
// fallback par muscle_group pour les exercices persos.
import type { Muscle } from "react-body-highlighter";

export type ExerciseMuscles = { primary: Muscle[]; secondary: Muscle[] };

const FALLBACK_BY_GROUP: Record<string, ExerciseMuscles> = {
  chest: { primary: ["chest"], secondary: [] },
  back: { primary: ["upper-back"], secondary: ["lower-back"] },
  shoulders: { primary: ["front-deltoids", "back-deltoids"], secondary: [] },
  biceps: { primary: ["biceps"], secondary: ["forearm"] },
  triceps: { primary: ["triceps"], secondary: [] },
  quads: { primary: ["quadriceps"], secondary: ["gluteal"] },
  hamstrings: { primary: ["hamstring"], secondary: ["gluteal"] },
  glutes: { primary: ["gluteal"], secondary: ["hamstring"] },
  calves: { primary: ["calves"], secondary: [] },
  core: { primary: ["abs"], secondary: ["obliques"] },
  other: { primary: [], secondary: [] },
};

export const EXERCISE_MUSCLES: Record<string, ExerciseMuscles> = {
  // Pectoraux
  "Cross-over poulie": { primary: ["chest"], secondary: ["front-deltoids"] },
  "Développé couché barre": { primary: ["chest"], secondary: ["triceps", "front-deltoids"] },
  "Développé couché haltères": { primary: ["chest"], secondary: ["triceps", "front-deltoids"] },
  "Développé décliné": { primary: ["chest"], secondary: ["triceps"] },
  "Développé incliné barre": { primary: ["chest"], secondary: ["front-deltoids", "triceps"] },
  "Développé incliné haltères": { primary: ["chest"], secondary: ["front-deltoids", "triceps"] },
  "Écarté à la poulie": { primary: ["chest"], secondary: ["front-deltoids"] },
  "Écarté couché haltères": { primary: ["chest"], secondary: ["front-deltoids"] },
  "Pec deck (butterfly)": { primary: ["chest"], secondary: ["front-deltoids"] },
  "Pompes": { primary: ["chest"], secondary: ["triceps", "front-deltoids", "abs"] },
  // Dos
  "Hyperextensions lombaires": { primary: ["lower-back"], secondary: ["gluteal", "hamstring"] },
  "Pull-over haltère": { primary: ["upper-back"], secondary: ["chest", "triceps"] },
  "Rowing barre": { primary: ["upper-back"], secondary: ["biceps", "back-deltoids", "lower-back"] },
  "Rowing haltères": { primary: ["upper-back"], secondary: ["biceps", "back-deltoids"] },
  "Rowing machine assis": { primary: ["upper-back"], secondary: ["biceps", "back-deltoids"] },
  "Rowing T-bar": { primary: ["upper-back"], secondary: ["biceps", "back-deltoids"] },
  "Shrugs (haussements)": { primary: ["trapezius"], secondary: ["forearm"] },
  "Soulevé de terre": { primary: ["lower-back", "gluteal", "hamstring"], secondary: ["trapezius", "quadriceps", "forearm"] },
  "Tirage horizontal poulie": { primary: ["upper-back"], secondary: ["biceps", "back-deltoids"] },
  "Tirage poulie prise serrée": { primary: ["upper-back"], secondary: ["biceps"] },
  "Tirage vertical poulie": { primary: ["upper-back"], secondary: ["biceps", "back-deltoids"] },
  "Tractions": { primary: ["upper-back"], secondary: ["biceps", "back-deltoids"] },
  // Épaules
  "Développé Arnold": { primary: ["front-deltoids"], secondary: ["back-deltoids", "triceps"] },
  "Développé haltères assis": { primary: ["front-deltoids"], secondary: ["triceps", "trapezius"] },
  "Développé militaire barre": { primary: ["front-deltoids"], secondary: ["triceps", "trapezius"] },
  "Élévations frontales": { primary: ["front-deltoids"], secondary: ["trapezius"] },
  "Élévations latérales haltères": { primary: ["front-deltoids", "back-deltoids"], secondary: ["trapezius"] },
  "Élévations latérales poulie": { primary: ["front-deltoids", "back-deltoids"], secondary: ["trapezius"] },
  "Face pull": { primary: ["back-deltoids"], secondary: ["trapezius", "upper-back"] },
  "Oiseau haltères": { primary: ["back-deltoids"], secondary: ["upper-back", "trapezius"] },
  "Rowing menton": { primary: ["front-deltoids", "trapezius"], secondary: ["biceps"] },
  // Biceps
  "Curl à la poulie": { primary: ["biceps"], secondary: ["forearm"] },
  "Curl barre": { primary: ["biceps"], secondary: ["forearm"] },
  "Curl concentration": { primary: ["biceps"], secondary: [] },
  "Curl haltères": { primary: ["biceps"], secondary: ["forearm"] },
  "Curl incliné haltères": { primary: ["biceps"], secondary: ["forearm"] },
  "Curl marteau": { primary: ["biceps"], secondary: ["forearm"] },
  "Curl pupitre": { primary: ["biceps"], secondary: ["forearm"] },
  // Triceps
  "Barre au front poulie": { primary: ["triceps"], secondary: [] },
  "Dips": { primary: ["triceps"], secondary: ["chest", "front-deltoids"] },
  "Extension corde poulie": { primary: ["triceps"], secondary: [] },
  "Extensions triceps poulie": { primary: ["triceps"], secondary: [] },
  "Extensions verticales haltère": { primary: ["triceps"], secondary: [] },
  "Kickback haltère": { primary: ["triceps"], secondary: [] },
  "Skull crushers": { primary: ["triceps"], secondary: [] },
  // Quadriceps
  "Fentes haltères": { primary: ["quadriceps"], secondary: ["gluteal", "hamstring"] },
  "Front squat": { primary: ["quadriceps"], secondary: ["gluteal", "abs", "lower-back"] },
  "Hack squat": { primary: ["quadriceps"], secondary: ["gluteal"] },
  "Leg extension": { primary: ["quadriceps"], secondary: [] },
  "Presse à cuisses": { primary: ["quadriceps"], secondary: ["gluteal", "hamstring"] },
  "Sissy squat": { primary: ["quadriceps"], secondary: [] },
  "Squat barre": { primary: ["quadriceps"], secondary: ["gluteal", "lower-back", "hamstring"] },
  "Squat bulgare": { primary: ["quadriceps"], secondary: ["gluteal", "hamstring"] },
  "Step-up": { primary: ["quadriceps"], secondary: ["gluteal"] },
  // Ischio-jambiers
  "Good morning": { primary: ["hamstring"], secondary: ["lower-back", "gluteal"] },
  "Leg curl allongé": { primary: ["hamstring"], secondary: ["calves"] },
  "Leg curl assis": { primary: ["hamstring"], secondary: ["calves"] },
  "Nordic curl": { primary: ["hamstring"], secondary: ["gluteal"] },
  "Souleve de terre jambes tendues": { primary: ["hamstring"], secondary: ["gluteal", "lower-back"] },
  "Soulevé de terre roumain": { primary: ["hamstring"], secondary: ["gluteal", "lower-back"] },
  // Fessiers
  "Abducteurs machine": { primary: ["abductors"], secondary: ["gluteal"] },
  "Fentes marchées": { primary: ["gluteal"], secondary: ["quadriceps", "hamstring"] },
  "Glute bridge": { primary: ["gluteal"], secondary: ["hamstring"] },
  "Hip thrust": { primary: ["gluteal"], secondary: ["hamstring"] },
  "Hip thrust machine": { primary: ["gluteal"], secondary: ["hamstring"] },
  "Kickback fessier poulie": { primary: ["gluteal"], secondary: ["hamstring"] },
  // Mollets
  "Mollets à la presse": { primary: ["calves"], secondary: [] },
  "Mollets assis": { primary: ["calves"], secondary: [] },
  "Mollets debout": { primary: ["calves"], secondary: [] },
  "Mollets unilatéral debout": { primary: ["calves"], secondary: [] },
  // Abdominaux
  "Crunch à la poulie": { primary: ["abs"], secondary: [] },
  "Crunchs": { primary: ["abs"], secondary: [] },
  "Gainage latéral": { primary: ["obliques"], secondary: ["abs"] },
  "Mountain climbers": { primary: ["abs"], secondary: ["obliques", "quadriceps"] },
  "Planche": { primary: ["abs"], secondary: ["obliques"] },
  "Relevés de jambes": { primary: ["abs"], secondary: [] },
  "Relevés de jambes suspendus": { primary: ["abs"], secondary: ["obliques"] },
  "Roue abdominale": { primary: ["abs"], secondary: ["obliques"] },
  "Russian twist": { primary: ["obliques"], secondary: ["abs"] },
  // Autre
  "Avant-bras curl poignets": { primary: ["forearm"], secondary: [] },
  "Cardio tapis": { primary: ["quadriceps", "calves"], secondary: ["hamstring", "gluteal"] },
};

export function getExerciseMuscles(
  name: string,
  muscleGroup: string,
): ExerciseMuscles {
  return (
    EXERCISE_MUSCLES[name] ??
    FALLBACK_BY_GROUP[muscleGroup] ??
    FALLBACK_BY_GROUP.other!
  );
}
