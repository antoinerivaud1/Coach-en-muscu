import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireProfileId } from "@/lib/profile";
import { getProgramWithDays } from "@/lib/queries/programs";
import type { ProgramFull, ProgramDayFull } from "@/lib/queries/programs";
import { MUSCLE_GROUP_LABELS } from "@/lib/utils/training";
import { startSession, deleteProgram } from "./actions";
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

  return (
    <main className="min-h-screen p-4 pb-24">
      <div className="mx-auto max-w-lg">
        <Link
          href="/dashboard"
          className="text-sm text-fg-muted hover:text-fg"
        >
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
          {days.length} {days.length === 1 ? "jour" : "jours"} · choisis ta
          séance du jour
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
              message="Supprimer ce programme ? Les séances déjà enregistrées sont conservées."
              className="w-full rounded-lg bg-surface2 py-2.5 text-sm font-semibold text-red-400"
            >
              Supprimer
            </ConfirmSubmit>
          </form>
        </div>

        <div className="mt-6 space-y-4">
          {days.map((day) => {
            const exercises = [...day.program_exercises].sort(
              (a, b) => a.order_index - b.order_index,
            );
            return (
              <section
                key={day.id}
                className="rounded-xl bg-surface p-4"
              >
                <div className="flex items-center justify-between gap-3">
                  <h2 className="font-semibold">{day.name}</h2>
                  <form action={startSession}>
                    <input type="hidden" name="day_id" value={day.id} />
                    <button
                      type="submit"
                      disabled={exercises.length === 0}
                      className="rounded-lg bg-toi px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
                    >
                      Démarrer
                    </button>
                  </form>
                </div>

                {exercises.length === 0 ? (
                  <p className="mt-3 text-sm text-fg-muted">
                    Aucun exercice sur ce jour.
                  </p>
                ) : (
                  <ul className="mt-3 space-y-2">
                    {exercises.map((pe) => (
                      <li
                        key={pe.id}
                        className="flex items-center justify-between border-t border-line pt-2 text-sm first:border-0 first:pt-0"
                      >
                        <div>
                          <span className="text-fg">
                            {pe.exercises?.name ?? "Exercice"}
                          </span>
                          <span className="ml-2 text-xs text-fg-muted">
                            {pe.exercises
                              ? MUSCLE_GROUP_LABELS[
                                  pe.exercises.muscle_group
                                ] ?? pe.exercises.muscle_group
                              : ""}
                          </span>
                        </div>
                        <span className="shrink-0 text-xs text-fg-muted">
                          {pe.target_sets}×{pe.target_reps_min}–
                          {pe.target_reps_max}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            );
          })}
        </div>
      </div>
    </main>
  );
}
