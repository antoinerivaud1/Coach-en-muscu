import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireProfileId } from "@/lib/profile";
import { getProgramWithDays } from "@/lib/queries/programs";
import type { ProgramFull, ProgramDayFull } from "@/lib/queries/programs";
import { MUSCLE_GROUP_LABELS } from "@/lib/utils/training";
import { countSets, deriveMuscleTags, splitVisibleTags } from "@/lib/utils/seances";
import type { MuscleGroup } from "@/lib/utils/seances";
import { deleteProgram } from "./actions";
import SeanceLibrary from "./SeanceLibrary";
import type { SeanceView } from "./SeanceLibrary";
import ConfirmSubmit from "@/components/ConfirmSubmit";

export default async function ProgramDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await requireProfileId();
  const supabase = await createClient();

  const { data } = await getProgramWithDays(supabase, id);
  const program = data as ProgramFull | null;
  if (!program) {
    notFound();
  }

  const days: ProgramDayFull[] = [...program.program_days].sort(
    (a, b) => a.order_index - b.order_index,
  );

  // Les tags sont dérivés ici, à la volée, depuis `exercises.muscle_group` :
  // rien n'est stocké sur la séance (CM-65).
  const seances: SeanceView[] = days.map((day) => {
    const exercises = [...day.program_exercises].sort(
      (a, b) => a.order_index - b.order_index,
    );
    const groups = exercises
      .map((pe) => pe.exercises?.muscle_group)
      .filter((g): g is MuscleGroup => Boolean(g));
    const { visible, overflow } = splitVisibleTags(deriveMuscleTags(groups));

    return {
      id: day.id,
      name: day.name,
      exerciseCount: exercises.length,
      setCount: countSets(exercises),
      tags: visible.map((t) => t.label),
      extraTags: overflow,
      exercises: exercises.map((pe) => ({
        id: pe.id,
        name: pe.exercises?.name ?? "Exercice",
        groupLabel: pe.exercises
          ? (MUSCLE_GROUP_LABELS[pe.exercises.muscle_group] ??
            pe.exercises.muscle_group)
          : "",
        targetSets: pe.target_sets,
        repsMin: pe.target_reps_min,
        repsMax: pe.target_reps_max,
      })),
    };
  });

  return (
    <main className="min-h-screen p-4 pb-24">
      <div className="mx-auto max-w-lg">
        <Link href="/dashboard" className="text-sm text-fg-muted hover:text-fg">
          ← Retour
        </Link>

        <div className="mt-3 flex items-center gap-2">
          <h1 className="text-2xl font-bold">{program.name}</h1>
          {program.couple_id && (
            <span className="rounded-full bg-elle/20 px-2 py-0.5 text-xs font-medium text-elle">
              Partagé
            </span>
          )}
        </div>
        <p className="mt-1 text-sm text-fg-muted">
          {seances.length} séance{seances.length > 1 ? "s" : ""} · choisis
          librement la tienne
        </p>

        <div className="mt-4 flex gap-3">
          <Link
            href={`/programs/${id}/edit`}
            className="flex-1 rounded-lg bg-surface2 py-2.5 text-center text-sm font-semibold text-fg"
          >
            Modifier
          </Link>
          <form action={deleteProgram} className="flex-1">
            <input type="hidden" name="program_id" value={id} />
            <ConfirmSubmit
              message="Supprimer ce programme et toutes ses séances types ? Les séances déjà enregistrées sont conservées."
              className="w-full rounded-lg bg-surface2 py-2.5 text-sm font-semibold text-red-400"
            >
              Supprimer
            </ConfirmSubmit>
          </form>
        </div>

        <div className="mt-6">
          <SeanceLibrary programId={id} seances={seances} />
        </div>
      </div>
    </main>
  );
}
