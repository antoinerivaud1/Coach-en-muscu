"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { finishSession, type LoggedSet } from "./actions";
import type { LastExerciseData } from "@/lib/queries/sessions";
import { formatWeight, formatDateShort } from "@/lib/utils/training";
import BackButton from "@/components/BackButton";
import ExerciseInfo from "@/components/ExerciseInfo";
import { addPending } from "@/lib/pendingSessions";

type Feedback = "easy" | "normal" | "hard" | "failure";

export type LoggerExercise = {
  exercise_id: string;
  name: string;
  target_sets: number;
  target_reps_min: number;
  target_reps_max: number;
  rest_seconds: number;
  muscle_group: string;
  last: LastExerciseData | null;
};

type InitialSet = { weight: string; reps: string; isWarmup: boolean };
type SetField = { weight: string; reps: string; isWarmup: boolean; touched: boolean };

type Props = {
  sessionId: string;
  dayName: string;
  exercises: LoggerExercise[];
  initialSets: Record<string, InitialSet[]>;
  editing: boolean;
};

const FEEDBACK_OPTIONS: { value: Feedback; label: string }[] = [
  { value: "easy", label: "Facile" },
  { value: "normal", label: "Normal" },
  { value: "hard", label: "Dur" },
  { value: "failure", label: "Échec" },
];

function fmtClock(total: number): string {
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function SessionLogger({
  sessionId,
  dayName,
  exercises,
  initialSets,
  editing,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const startedAt = useRef<number>(Date.now());

  const [sets, setSets] = useState<Record<string, SetField[]>>(() => {
    const out: Record<string, SetField[]> = {};
    for (const ex of exercises) {
      const rows = initialSets[ex.exercise_id] ?? [];
      out[ex.exercise_id] = rows.map((r) => ({ ...r, touched: editing }));
    }
    return out;
  });
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [offlineSaved, setOfflineSaved] = useState(false);

  // ----- Minuteur de repos -----
  const [restRemaining, setRestRemaining] = useState<number | null>(null);
  const [restTotal, setRestTotal] = useState<number>(0);

  useEffect(() => {
    if (restRemaining === null) return;
    if (restRemaining <= 0) {
      setRestRemaining(null);
      if (typeof navigator !== "undefined" && "vibrate" in navigator) {
        navigator.vibrate?.(400);
      }
      return;
    }
    const t = setTimeout(
      () => setRestRemaining((s) => (s === null ? null : s - 1)),
      1000,
    );
    return () => clearTimeout(t);
  }, [restRemaining]);

  function startRest(seconds: number) {
    const s = seconds > 0 ? seconds : 90;
    setRestTotal(s);
    setRestRemaining(s);
  }

  const completedCount = useMemo(() => {
    let n = 0;
    for (const ex of exercises) {
      const rows = sets[ex.exercise_id] ?? [];
      if (rows.some((r) => r.touched && Number(r.reps) > 0)) n += 1;
    }
    return n;
  }, [sets, exercises]);

  function updateField(
    exId: string,
    rowIndex: number,
    field: "weight" | "reps",
    value: string,
  ) {
    setSets((prev) => {
      const rows = prev[exId] ? [...prev[exId]!] : [];
      const current = rows[rowIndex] ?? {
        weight: "",
        reps: "",
        isWarmup: false,
        touched: false,
      };
      rows[rowIndex] = { ...current, [field]: value, touched: true };
      return { ...prev, [exId]: rows };
    });
  }

  function step(
    exId: string,
    rowIndex: number,
    field: "weight" | "reps",
    delta: number,
  ) {
    setSets((prev) => {
      const rows = prev[exId] ? [...prev[exId]!] : [];
      const current = rows[rowIndex] ?? {
        weight: "",
        reps: "",
        isWarmup: false,
        touched: false,
      };
      const raw = Number(current[field]);
      const base = Number.isFinite(raw) ? raw : 0;
      const next = Math.max(0, base + delta);
      const value = field === "weight" ? formatWeight(next) : String(next);
      rows[rowIndex] = { ...current, [field]: value, touched: true };
      return { ...prev, [exId]: rows };
    });
  }

  function toggleWarmup(exId: string, rowIndex: number) {
    setSets((prev) => {
      const rows = prev[exId] ? [...prev[exId]!] : [];
      const current = rows[rowIndex];
      if (!current) return prev;
      rows[rowIndex] = {
        ...current,
        isWarmup: !current.isWarmup,
        touched: true,
      };
      return { ...prev, [exId]: rows };
    });
  }

  function addRow(exId: string) {
    setSets((prev) => {
      const rows = prev[exId] ? [...prev[exId]!] : [];
      const last = rows[rows.length - 1];
      rows.push({
        weight: last?.weight ?? "",
        reps: "",
        isWarmup: false,
        touched: true,
      });
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
      let idx = 0;
      for (const r of rows) {
        const reps = parseInt(r.reps, 10);
        const weight = r.weight === "" ? 0 : Number(r.weight.replace(",", "."));
        if (r.touched && Number.isFinite(reps) && reps > 0 && Number.isFinite(weight)) {
          idx += 1;
          payload.push({
            exercise_id: ex.exercise_id,
            set_index: idx,
            weight_kg: weight,
            reps,
            is_warmup: r.isWarmup,
          });
        }
      }
    }

    if (payload.length === 0) {
      setError("Saisis au moins une série (reps > 0) avant de terminer.");
      return;
    }

    const durationSeconds = Math.round((Date.now() - startedAt.current) / 1000);

    const input = { sessionId, sets: payload, feedback, durationSeconds };

    startTransition(async () => {
      try {
        const result = await finishSession(input);
        if (!result.success) {
          setError(result.error);
          return;
        }
        router.push(`/sessions/${sessionId}`);
        router.refresh();
      } catch {
        // Pas de réseau : on garde la séance localement, synchro auto plus tard.
        addPending(input);
        setOfflineSaved(true);
      }
    });
  }

  return (
    <div className="mx-auto max-w-lg pb-44">
      <div className="sticky top-0 z-10 -mx-4 bg-zinc-950/90 px-4 py-3 backdrop-blur">
        <div className="mb-1">
          <BackButton label="Quitter" />
        </div>
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
              <div className="flex items-center justify-between gap-2">
                <h2 className="font-semibold">{ex.name}</h2>
                <ExerciseInfo name={ex.name} muscleGroup={ex.muscle_group} />
              </div>
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
                <div className="grid grid-cols-[1.5rem_1fr_1fr_2rem] items-center gap-2 px-1 text-[11px] uppercase tracking-wide text-zinc-500">
                  <span>#</span>
                  <span>Poids (kg)</span>
                  <span>Reps</span>
                  <span></span>
                </div>
                {rows.map((row, i) => (
                  <div key={i} className="space-y-1">
                    <div className="grid grid-cols-[1.5rem_1fr_1fr_2rem] items-center gap-2">
                      <span className="text-center text-sm text-zinc-500">
                        {row.isWarmup ? "↑" : i + 1}
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
                    <button
                      type="button"
                      onClick={() => toggleWarmup(ex.exercise_id, i)}
                      className={`ml-7 text-[11px] font-medium ${
                        row.isWarmup ? "text-toi" : "text-zinc-600"
                      }`}
                    >
                      {row.isWarmup ? "● Échauffement" : "○ Marquer échauffement"}
                    </button>
                  </div>
                ))}
              </div>

              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => addRow(ex.exercise_id)}
                  className="flex-1 rounded-lg border border-dashed border-zinc-700 py-2 text-xs text-zinc-400 hover:border-zinc-500 hover:text-zinc-200"
                >
                  + Ajouter une série
                </button>
                <button
                  type="button"
                  onClick={() => startRest(ex.rest_seconds)}
                  className="rounded-lg bg-zinc-800 px-3 py-2 text-xs font-medium text-zinc-300 active:bg-zinc-700"
                >
                  ⏱ Repos {ex.rest_seconds}s
                </button>
              </div>
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

      {offlineSaved && (
        <p className="mt-4 rounded-lg bg-amber-950/50 px-3 py-2 text-sm text-amber-200">
          Séance enregistrée hors-ligne. Elle se synchronisera automatiquement
          dès que tu auras du réseau.
        </p>
      )}

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-zinc-800 bg-zinc-950/95 p-4 backdrop-blur">
        <div className="mx-auto max-w-lg space-y-3">
          {restRemaining !== null && (
            <button
              type="button"
              onClick={() => setRestRemaining(null)}
              className="flex w-full flex-col items-center rounded-xl bg-toi/15 py-4 active:bg-toi/25"
            >
              <span className="text-xs uppercase tracking-wide text-toi/80">
                Repos en cours · appuie pour passer
              </span>
              <span className="mt-1 text-5xl font-bold tabular-nums text-toi">
                {fmtClock(restRemaining)}
              </span>
              <span className="mt-1 text-xs text-zinc-500">
                / {fmtClock(restTotal)}
              </span>
            </button>
          )}
          {offlineSaved ? (
            <button
              type="button"
              onClick={() => router.push("/dashboard")}
              className="w-full rounded-xl bg-toi py-3 font-semibold text-white"
            >
              Retour à l&apos;accueil
            </button>
          ) : (
            <button
              type="button"
              onClick={handleFinish}
              disabled={isPending}
              className="w-full rounded-xl bg-toi py-3 font-semibold text-white disabled:opacity-50"
            >
              {isPending ? "Enregistrement…" : "Terminer la séance"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
