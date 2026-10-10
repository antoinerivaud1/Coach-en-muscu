import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireProfileId, getMemberProfiles } from "@/lib/profile";
import { toMembers } from "@/lib/duo";
import { getCatalogExercises } from "@/lib/queries/exercises";
import type { SystemExercise } from "@/lib/queries/exercises";
import {
  canAccessProgram,
  getDayWithExercises,
  getPersonalProgramId,
  getProgramDayNames,
  getSharedProgramId,
} from "@/lib/queries/programs";
import type { MuscleGroup, SeanceDraftExercise } from "@/lib/utils/seances";
import SeanceBuilder, { type OwnerChoice } from "../../SeanceBuilder";

/**
 * Édition d'une séance type (CM-81) : le MÊME écran que la création,
 * pré-rempli.
 *
 * `id` vient de l'URL : l'appartenance est vérifiée ici en code, en plus de la
 * RLS (CM-59 B). Une séance inaccessible
 * rend un 404, comme une séance inexistante — rien ne doit révéler qu'elle
 * existe chez un autre couple.
 */
export default async function EditSeancePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const profileId = await requireProfileId(`/seances/${id}/edit`);
  const supabase = await createClient();

  const { data: day } = await getDayWithExercises(supabase, id);
  if (!day) {
    notFound();
  }

  const access = await canAccessProgram(supabase, day.program_id, profileId);
  if (!access.ok || !access.allowed) {
    notFound();
  }

  const { duoId, profiles } = await getMemberProfiles(supabase, profileId);
  const members = toMembers(profiles, profileId);
  const partner = members.find((m) => !m.isMe);
  const me = members.find((m) => m.isMe);
  const { data: catalogData } = await getCatalogExercises(supabase, duoId, profileId);
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

  const namesOf = async (programId: string | null) => {
    if (!programId) return [];
    const siblings = await getProgramDayNames(supabase, programId);
    return siblings.ok
      ? siblings.days.filter((d) => d.id !== day.id).map((d) => d.name)
      : [];
  };
  const otherNames = await namesOf(day.program_id);

  // CM-87 : en duo, « Partager avec … » / « Garder pour moi ».
  let owner: OwnerChoice | undefined;
  if (duoId && partner && me) {
    const { data: prog, error: progError } = await supabase
      .from("programs")
      .select("duo_id")
      .eq("id", day.program_id)
      .returns<{ duo_id: string | null }[]>()
      .maybeSingle();
    // C2 : état illisible => pas de choix affiché (rien ne sera basculé).
    if (!progError && prog) {
      const shared = Boolean(prog.duo_id);
      const otherSide = shared
        ? await namesOf(await getPersonalProgramId(supabase, profileId))
        : await namesOf(await getSharedProgramId(supabase, duoId));
      owner = {
        partnerName: partner.name,
        myColor: me.color,
        initial: shared ? "duo" : "perso",
        otherNamesByTarget: shared
          ? { duo: otherNames, perso: otherSide }
          : { duo: otherSide, perso: otherNames },
      };
    }
  }

  return (
    <SeanceBuilder
      mode="edit"
      dayId={day.id}
      initialName={day.name}
      initialExercises={initialExercises}
      otherNames={otherNames}
      owner={owner}
      catalog={catalog}
      canCreateExercise
      backHref="/seances"
    />
  );
}
