import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireProfileId, getCoupleId } from "@/lib/profile";
import { getCatalogExercises } from "@/lib/queries/exercises";
import type { SystemExercise } from "@/lib/queries/exercises";
import {
  canAccessProgram,
  getDayWithExercises,
  getProgramDayNames,
} from "@/lib/queries/programs";
import type { MuscleGroup, SeanceDraftExercise } from "@/lib/utils/seances";
import SeanceBuilder from "../../SeanceBuilder";

/**
 * Édition d'une séance type (CM-81) : le MÊME écran que la création,
 * pré-rempli.
 *
 * `id` vient de l'URL et le client serveur contourne la RLS (`service_role`,
 * CM-17) : l'appartenance est vérifiée ici en code. Une séance inaccessible
 * rend un 404, comme une séance inexistante — rien ne doit révéler qu'elle
 * existe chez un autre couple.
 */
export default async function EditSeancePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const profileId = await requireProfileId();
  const supabase = await createClient();

  const { data: day } = await getDayWithExercises(supabase, id);
  if (!day) {
    notFound();
  }

  const access = await canAccessProgram(supabase, day.program_id, profileId);
  if (!access.ok || !access.allowed) {
    notFound();
  }

  const coupleId = await getCoupleId(supabase, profileId);
  const { data: catalogData } = await getCatalogExercises(supabase, coupleId);
  const catalog: SystemExercise[] = catalogData ?? [];

  const initialExercises: SeanceDraftExercise[] = [...day.program_exercises]
    .sort((a, b) => a.order_index - b.order_index)
    .map((pe) => ({
      exerciseId: pe.exercise_id,
      name: pe.exercises?.name ?? "Exercice",
      muscleGroup: (pe.exercises?.muscle_group ?? "other") as MuscleGroup,
      targetSets: pe.target_sets,
      targetRepsMin: pe.target_reps_min,
      targetRepsMax: pe.target_reps_max,
      restSeconds: pe.rest_seconds,
    }));

  const siblings = await getProgramDayNames(supabase, day.program_id);
  const otherNames = siblings.ok
    ? siblings.days.filter((d) => d.id !== day.id).map((d) => d.name)
    : [];

  return (
    <SeanceBuilder
      mode="edit"
      dayId={day.id}
      initialName={day.name}
      initialExercises={initialExercises}
      otherNames={otherNames}
      catalog={catalog}
      canCreateExercise={Boolean(coupleId)}
      backHref={`/programs/${day.program_id}`}
    />
  );
}
