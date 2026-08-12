import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireProfileId, getCoupleId, getCoupleProfileIds } from "@/lib/profile";
import { getProgramWithDays } from "@/lib/queries/programs";
import type { ProgramFull } from "@/lib/queries/programs";
import { getCatalogExercises } from "@/lib/queries/exercises";
import type { SystemExercise } from "@/lib/queries/exercises";
import ProgramForm from "@/app/programs/new/ProgramForm";
import BackButton from "@/components/BackButton";

export default async function EditProgramPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const profileId = await requireProfileId();
  const supabase = await createClient();

  const { data } = await getProgramWithDays(supabase, id);
  const program = data as ProgramFull | null;
  if (!program) {
    notFound();
  }

  const coupleId = await getCoupleId(supabase, profileId);
  const partnerIds = coupleId
    ? (await getCoupleProfileIds(supabase, coupleId)).filter(
        (pid) => pid !== profileId,
      )
    : [];
  const hasCouple = partnerIds.length > 0;

  const { data: exercisesData } = await getCatalogExercises(supabase, coupleId);
  const exercises: SystemExercise[] = exercisesData ?? [];

  const initialDays = [...program.program_days]
    .sort((a, b) => a.order_index - b.order_index)
    .map((d) => ({
      id: d.id,
      name: d.name,
      exercises: [...d.program_exercises]
        .sort((a, b) => a.order_index - b.order_index)
        .map((pe) => ({
          exercise_id: pe.exercise_id,
          target_sets: pe.target_sets,
          target_reps_min: pe.target_reps_min,
          target_reps_max: pe.target_reps_max,
          rest_seconds: pe.rest_seconds,
        })),
    }));

  return (
    <main className="min-h-screen p-4">
      <div className="mx-auto mb-2 max-w-lg">
        <BackButton fallback={`/programs/${id}`} />
      </div>
      <ProgramForm
        exercises={exercises}
        hasCouple={hasCouple}
        canCreateExercise={Boolean(coupleId)}
        mode="edit"
        programId={id}
        initialName={program.name}
        initialScope={program.couple_id ? "couple" : "individual"}
        initialDays={initialDays}
      />
    </main>
  );
}
