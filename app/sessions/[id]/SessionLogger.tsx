"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { finishSession, type LoggedSet } from "./actions";
import type { LastExerciseData } from "@/lib/queries/sessions";
import { formatWeight, formatDateShort } from "@/lib/utils/training";

type Feedback = "easy" | "normal" | "hard" | "failure";

export type LoggerExercise = {
  exercise_id: string;
  name: string;
  target_sets: number;
  target_reps_min: number;
  target_reps_max: number;
  last: LastExerciseData | null;
};

type SetField = { weight: string; reps: string };

type Props = {
  sessionId: string;
  dayName: string;
  exercises: LoggerExercise[];
  initialSets: Record<string, SetField[]>;
};

const FEEDBACK_OPTIONS: { value: Feedback; label: string }[] = [
  { value: "easy", label: "Facile" },
  { value: "normal", label: "Normal" },
  { value: "hard", label: "Dur" },
  { value: "failure", label: "Échec" },
];

export default function SessionLogger({
  sessionId,
  dayName,
  exercises,
  initialSets,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const startedAt = useRef<number>(Date.now());

  const [sets, setSets] = useState<Record<string, SetField[]>>(initialSets);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [error, setError] = useState<string | null>(null);

  const completedCount = useMemo(() => {
    let n = 0;
    for (const ex of exercises) {
      const rows = sets[ex.exercise_id] ?? [];
      if (rows.some((r) => Number(r.reps) > 0)) n += 1;
    }
    return n;
  }, [sets, exercises]);

  function updateField(
    exId: string,
    rowIndex: number,
    field: keyof SetField,
    value: string,
  ) {
    setSets((prev) => {
      const rows = prev[exId] ? [...prev[exId]!] : [];
      const current = rows[rowIndex] ?? { weight: "", reps: "" };
      rows[rowIndex] = { ...current, [field]: value };
      return { ...prev, [exId]: rows };
    });
  }

  function step(
    exId: string,
    rowIndex: number,
    field: keyof SetField,
    delta: number,
  ) {
    setSets((prev) => {
      const rows = prev[exId] ? [...prev[exId]!] : [];
      const current = rows[rowIndex] ?? { weight: "", reps: "" };
      const raw = Number(current[field]);
      const base = Number.isFinite(raw) ? raw : 0;
      const next = Math.max(0, base + delta);
      const value = field === "weight" ? formatWeight(next) : String(next);
      rows[rowIndex] = { ...current, [field]: value };
      return { ...prev, [exId]: rows };
    });
  }

  function addRow(exId: string) {
    setSets((prev) => {
      const rows = prev[exId] ? [...prev[exId]!] : [];
      const last = rows[rows.length - 1];
      rows.push({ weight: last?.weight ?? "", reps: "" });
      return { ...prev, [exId]: rows };
    });
  }

  function removeRow(exId: string, rowIndex: number) {
    setSets((prev) => {
      const rows = prev[exId] ? [...prev[exId]!] : [];
      rows.splice(rowIndex, 1);
      return { ...prev, [exId]: rows };
    });
  }

  function handleFinish() {
    setError(null);
    const payload: LoggedSet[] = [];
    for (const ex of exercises) {
      const rows = sets[ex.exercise_id] ?? [];
      rows.forEach((r, i) => {
        const reps = parseInt(r.reps, 10);
        const weight = r.weight === "" ? 0 : Number(r.weight.replace(",", "."));
        if (Number.isFinite(reps) && reps > 0 && Number.isFinite(weight)) {
          payload.push({
            exercise_id: ex.exercise_id,
            set_index: i + 1,
            weight_kg: weight,
            reps,
          });
        }
      });
    }

    if (payload.length === 0) {
      setError("Saisis au moins une série (reps > 0) avant de terminer.");
      return;
    }

    const durationSeconds = Math.round((Date.now() - startedAt.current) / 1000);

    startTransition(async () => {
      const result = await finishSession({
        sessionId,
        sets: payload,
        feedback,
        durationSeconds,
      });
      if (!result.success) {
        setError(result.error);
        return;
      }
      router.push(`/sessions/${sessionId}`);
      router.refresh();
    });
  }

  return (
    <div className="mx-auto max-w-lg pb-32">
      <div className="sticky top-0 z-10 -mx-4 bg-zinc-950/90 px-4 py-3 backdrop-blur">
        <h1 className="text-xl font-bold">{dayName}</h1>
        <p className="text-sm text-zinc-400">
          Séance en cours · {completedCount}/{exercises.length} exos remplis
        </p>
      </div>

      <div className="mt-4 space-y-4">
        {exercises.map((ex) => {
          const rows = sets[ex.exercise_id] ?? [];
          const last = ex.last;
          return (
            <section key={ex.exercise_id} className="rounded-xl bg-zinc-900 p-4">
              <h2 className="font-semibold">{ex.name}</h2>
              <p className="mt-0.5 text-xs text-zinc-500">
                Objectif {ex.target_sets}×{ex.target_reps_min}–
                {ex.target_reps_max}
              </p>

              {last && last.sets.length > 0 ? (
                <p className="mt-2 rounded-lg bg-zinc-800/60 px-3 py-2 text-xs text-zinc-300">
                  <span className="text-zinc-500">
                    Dernière fois ({formatDateShort(last.performed_at)}) :{" "}
                  </span>
                  {last.sets
                    .map((s) => `${formatWeight(s.weight_kg)}×${s.reps}`)
                    .join("  ·  ")}
                </p>
              ) : (
                <p className="mt-2 text-xs text-zinc-600">
                  Première fois sur cet exercice
                </p>
              )}

              <div className="mt-3 space-y-2">
                <div className="grid grid-cols-[1.5rem_1fr_1fr_1.5rem] items-center gap-2 px-1 text-[11px] uppercase tracking-wide text-zinc-500">
                  <span>#</span>
                  <span>Poids (kg)</span>
                  <span>Reps</span>
                  <span></span>
                </div>
                {rows.map((row, i) => (
                  <div
                    key={i}
                    className="grid grid-cols-[1.5rem_1fr_1fr_1.5rem] items-center gap-2"
                  >
                    <span className="text-center text-sm text-zinc-500">
                      {i + 1}
                    </span>

                    <div className="flex items-center overflow-hidden rounded-lg bg-zinc-800">
                      <button
                        type="button"
                        onClick={() => step(ex.exercise_id, i, "weight", -2.5)}
                        className="flex h-12 w-12 shrink-0 items-center justify-center text-2xl leading-none text-zinc-300 active:bg-zinc-700"
                        aria-label="Moins"
                      >
                        −
                      </button>
                      <input
                        type="number"
                        inputMode="decimal"
                        step="0.5"
                        value={row.weight}
                        placeholder={
                          last?.sets[i]
                            ? formatWeight(last.sets[i]!.weight_kg)
                            : "0"
                        }
                        onChange={(e) =>
                          updateField(ex.exercise_id, i, "weight", e.target.value)
                        }
                        className="w-full min-w-0 bg-transparent py-3 text-center text-lg text-white focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => step(ex.exercise_id, i, "weight", 2.5)}
                        className="flex h-12 w-12 shrink-0 items-center justify-center text-2xl leading-none text-zinc-300 active:bg-zinc-700"
                        aria-label="Plus"
                      >
                        +
                      </button>
                    </div>

                    <div className="flex items-center overflow-hidden rounded-lg bg-zinc-800">
                      <button
                        type="button"
                        onClick={() => step(ex.exercise_id, i, "reps", -1)}
                        className="flex h-12 w-12 shrink-0 items-center justify-center text-2xl leading-none text-zinc-300 active:bg-zinc-700"
                        aria-label="Moins"
                      >
                        −
                      </button>
                      <input
                        type="number"
                        inputMode="numeric"
                        value={row.reps}
                        placeholder={
                          last?.sets[i] ? String(last.sets[i]!.reps) : "0"
                        }
                        onChange={(e) =>
                          updateField(ex.exercise_id, i, "reps", e.target.value)
                        }
                        className="w-full min-w-0 bg-transparent py-3 text-center text-lg text-white focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => step(ex.exercise_id, i, "reps", 1)}
                        className="flex h-12 w-12 shrink-0 items-center justify-center text-2xl leading-none text-zinc-300 active:bg-zinc-700"
                        aria-label="Plus"
                      >
                        +
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={() => removeRow(ex.exercise_id, i)}
                      className="text-center text-zinc-600 hover:text-red-400"
                      aria-label="Supprimer la série"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>

              <button
                type="button"
                onClick={() => addRow(ex.exercise_id)}
                className="mt-2 w-full rounded-lg border border-dashed border-zinc-700 py-2 text-xs text-zinc-400 hover:border-zinc-500 hover:text-zinc-200"
              >
                + Ajouter une série
              </button>
            </section>
          );
        })}
      </div>

      <div className="mt-6 rounded-xl bg-zinc-900 p-4">
        <p className="text-sm font-medium text-zinc-300">
          Ressenti de la séance
        </p>
        <div className="mt-2 grid grid-cols-4 gap-2">
          {FEEDBACK_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() =>
                setFeedback((prev) => (prev === opt.value ? null : opt.value))
              }
              className={`rounded-lg py-2 text-xs font-medium transition-colors ${
                feedback === opt.value
                  ? "bg-toi text-white"
                  : "bg-zinc-800 text-zinc-400"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <p className="mt-4 rounded-lg bg-red-950/50 px-3 py-2 text-sm text-red-300">
          {error}
        </p>
      )}

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-zinc-800 bg-zinc-950/95 p-4 backdrop-blur">
        <div className="mx-auto max-w-lg">
          <button
            type="button"
            onClick={handleFinish}
            disabled={isPending}
            className="w-full rounded-xl bg-toi py-3 font-semibold text-white disabled:opacity-50"
          >
            {isPending ? "Enregistrement…" : "Terminer la séance"}
          </button>
        </div>
      </div>
    </div>
  );
}
