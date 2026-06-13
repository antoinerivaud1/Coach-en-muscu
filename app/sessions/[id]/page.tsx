import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getDayWithExercises } from "@/lib/queries/programs";
import type { ProgramDayFull } from "@/lib/queries/programs";
import {
  getSession,
  getSessionSets,
  getLastSetsByExercise,
  getAllSetsForProgress,
} from "@/lib/queries/sessions";
import type {
  SessionRow,
  SessionSetRow,
  ProgressRow,
} from "@/lib/queries/sessions";
import {
  bestE1RM,
  totalVolume,
  formatWeight,
  formatDateLong,
  estimatedOneRepMax,
} from "@/lib/utils/training";
import SessionLogger, { type LoggerExercise } from "./SessionLogger";
import { deleteSession } from "./actions";

const FEEDBACK_LABELS: Record<string, string> = {
  easy: "Facile",
  normal: "Normal",
  hard: "Dur",
  failure: "Échec",
};

export default async function SessionPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ edit?: string }>;
}) {
  const { id } = await params;
  const { edit } = await searchParams;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  const { data: sessionData } = await getSession(supabase, id);
  const session = sessionData as SessionRow | null;
  if (!session) {
    notFound();
  }

  const isMine = session.profile_id === user.id;

  const { data: setsData } = await getSessionSets(supabase, id);
  const existingSets = (setsData ?? []) as SessionSetRow[];

  const loggerMode = isMine && (existingSets.length === 0 || edit === "1");

  // ---------- Mode saisie ----------
  if (loggerMode) {
    if (!session.program_day_id) {
      notFound();
    }
    const { data: dayData } = await getDayWithExercises(
      supabase,
      session.program_day_id,
    );
    const day = dayData as ProgramDayFull | null;
    if (!day) {
      notFound();
    }

    const programExercises = [...day.program_exercises].sort(
      (a, b) => a.order_index - b.order_index,
    );
    const exerciseIds = programExercises.map((pe) => pe.exercise_id);
    const lastByExercise = await getLastSetsByExercise(
      supabase,
      user.id,
      exerciseIds,
      id,
    );

    const exercises: LoggerExercise[] = programExercises.map((pe) => ({
      exercise_id: pe.exercise_id,
      name: pe.exercises?.name ?? "Exercice",
      target_sets: pe.target_sets,
      target_reps_min: pe.target_reps_min,
      target_reps_max: pe.target_reps_max,
      last: lastByExercise[pe.exercise_id] ?? null,
    }));

    // Pré-remplissage des champs.
    const initialSets: Record<string, { weight: string; reps: string }[]> = {};
    const existingByExercise: Record<string, SessionSetRow[]> = {};
    for (const s of existingSets) {
      (existingByExercise[s.exercise_id] ??= []).push(s);
    }

    for (const pe of programExercises) {
      const existing = existingByExercise[pe.exercise_id];
      if (existing && existing.length > 0) {
        initialSets[pe.exercise_id] = [...existing]
          .sort((a, b) => a.set_index - b.set_index)
          .map((s) => ({
            weight: formatWeight(s.weight_kg),
            reps: String(s.reps),
          }));
      } else {
        const count = Math.max(1, pe.target_sets);
        initialSets[pe.exercise_id] = Array.from({ length: count }, () => ({
          weight: "",
          reps: "",
        }));
      }
    }

    return (
      <main className="min-h-screen p-4">
        <SessionLogger
          sessionId={id}
          dayName={day.name}
          exercises={exercises}
          initialSets={initialSets}
        />
      </main>
    );
  }

  // ---------- Mode récap (lecture) ----------
  // Nom du jour.
  let dayName = "Séance";
  if (session.program_day_id) {
    const { data: dayData } = await getDayWithExercises(
      supabase,
      session.program_day_id,
    );
    if (dayData) dayName = (dayData as ProgramDayFull).name;
  }

  // Noms d'exercices.
  const setExerciseIds = Array.from(
    new Set(existingSets.map((s) => s.exercise_id)),
  );
  const exerciseNames: Record<string, string> = {};
  if (setExerciseIds.length > 0) {
    const { data: exData } = await supabase
      .from("exercises")
      .select("id, name")
      .in("id", setExerciseIds)
      .returns<{ id: string; name: string }[]>();
    for (const ex of exData ?? []) exerciseNames[ex.id] = ex.name;
  }

  // Données historiques pour détecter les records (relatif au propriétaire).
  const { data: allSetsData } = await getAllSetsForProgress(
    supabase,
    session.profile_id,
  );
  const allSets = (allSetsData ?? []) as ProgressRow[];

  // Regroupe les séries de la séance par exercice.
  const setsByExercise: Record<string, SessionSetRow[]> = {};
  for (const s of existingSets) {
    (setsByExercise[s.exercise_id] ??= []).push(s);
  }

  // Pour chaque exercice: best e1RM de cette séance vs meilleur antérieur.
  const prByExercise: Record<string, boolean> = {};
  for (const exId of Object.keys(setsByExercise)) {
    const thisBest = bestE1RM(setsByExercise[exId]!);
    let priorBest = 0;
    for (const row of allSets) {
      if (row.exercise_id !== exId) continue;
      const performedAt = row.sessions?.performed_at;
      if (!performedAt || performedAt >= session.performed_at) continue;
      const e = estimatedOneRepMax(row.weight_kg, row.reps);
      if (e > priorBest) priorBest = e;
    }
    prByExercise[exId] = priorBest > 0 && thisBest > priorBest + 0.01;
  }

  const orderedExerciseIds = Object.keys(setsByExercise);
  const sessionVolume = totalVolume(existingSets);
  const prCount = Object.values(prByExercise).filter(Boolean).length;
  const durationMin = session.duration_seconds
    ? Math.round(session.duration_seconds / 60)
    : null;

  return (
    <main className="min-h-screen p-4 pb-24">
      <div className="mx-auto max-w-lg">
        <Link
          href="/history"
          className="text-sm text-zinc-400 hover:text-zinc-200"
        >
          ← Historique
        </Link>

        <h1 className="mt-3 text-2xl font-bold">{dayName}</h1>
        <p className="mt-1 text-sm text-zinc-400">
          {formatDateLong(session.performed_at)}
          {durationMin !== null ? ` · ${durationMin} min` : ""}
          {session.feedback
            ? ` · ${FEEDBACK_LABELS[session.feedback] ?? session.feedback}`
            : ""}
        </p>

        {prCount > 0 && (
          <div className="mt-4 rounded-xl bg-toi/15 px-4 py-3 text-sm font-medium text-toi">
            🏆 {prCount} nouveau{prCount > 1 ? "x" : ""} record
            {prCount > 1 ? "s" : ""} sur cette séance !
          </div>
        )}

        <div className="mt-4 grid grid-cols-2 gap-3">
          <div className="rounded-xl bg-zinc-900 p-3">
            <p className="text-xs text-zinc-500">Volume total</p>
            <p className="mt-1 text-lg font-bold">
              {Math.round(sessionVolume).toLocaleString("fr-FR")} kg
            </p>
          </div>
          <div className="rounded-xl bg-zinc-900 p-3">
            <p className="text-xs text-zinc-500">Exercices</p>
            <p className="mt-1 text-lg font-bold">
              {orderedExerciseIds.length}
            </p>
          </div>
        </div>

        <div className="mt-4 space-y-3">
          {orderedExerciseIds.map((exId) => {
            const rows = [...setsByExercise[exId]!].sort(
              (a, b) => a.set_index - b.set_index,
            );
            return (
              <section key={exId} className="rounded-xl bg-zinc-900 p-4">
                <div className="flex items-center justify-between">
                  <h2 className="font-semibold">
                    {exerciseNames[exId] ?? "Exercice"}
                  </h2>
                  {prByExercise[exId] && (
                    <span className="rounded-full bg-toi/20 px-2 py-0.5 text-xs font-medium text-toi">
                      🏆 Record
                    </span>
                  )}
                </div>
                <ul className="mt-2 flex flex-wrap gap-2">
                  {rows.map((r) => (
                    <li
                      key={r.id}
                      className="rounded-lg bg-zinc-800 px-3 py-1.5 text-sm"
                    >
                      <span className="font-medium">
                        {formatWeight(r.weight_kg)}
                      </span>
                      <span className="text-zinc-500"> kg × </span>
                      <span className="font-medium">{r.reps}</span>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>

        {isMine && (
          <div className="mt-6 flex gap-3">
            <Link
              href={`/sessions/${id}?edit=1`}
              className="flex-1 rounded-lg bg-zinc-800 py-3 text-center text-sm font-semibold text-zinc-200"
            >
              Modifier
            </Link>
            <form action={deleteSession} className="flex-1">
              <input type="hidden" name="session_id" value={id} />
              <SubmitDelete />
            </form>
          </div>
        )}
      </div>
    </main>
  );
}

function SubmitDelete() {
  return (
    <button
      type="submit"
      className="w-full rounded-lg bg-zinc-800 py-3 text-sm font-semibold text-red-400"
    >
      Supprimer
    </button>
  );
}
