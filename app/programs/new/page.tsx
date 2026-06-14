import { createClient } from "@/lib/supabase/server";
import { requireProfileId, getCoupleId, getCoupleProfileIds } from "@/lib/profile";
import { getSystemExercises } from "@/lib/queries/exercises";
import type { SystemExercise } from "@/lib/queries/exercises";
import ProgramForm from "./ProgramForm";

export default async function NewProgramPage() {
  const profileId = await requireProfileId();
  const supabase = await createClient();

  const coupleId = await getCoupleId(supabase, profileId);
  const partnerIds = coupleId
    ? (await getCoupleProfileIds(supabase, coupleId)).filter(
        (pid) => pid !== profileId,
      )
    : [];
  const hasCouple = partnerIds.length > 0;

  const { data: exercisesData } = await getSystemExercises(supabase);
  const exercises: SystemExercise[] = exercisesData ?? [];

  return <ProgramForm exercises={exercises} hasCouple={hasCouple} />;
}
