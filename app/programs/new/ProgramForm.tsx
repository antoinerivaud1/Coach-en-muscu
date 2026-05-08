"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createProgram } from "./actions";
import type { SystemExercise } from "@/lib/queries/exercises";

type Props = {
  exercises: SystemExercise[];
  hasCouple: boolean;
};

type ExerciseEntry = {
  exercise_id: string;
  target_sets: number;
  target_reps_min: number;
  target_reps_max: number;
  rest_seconds: number;
};

type DayEntry = {
  name: string;
  exercises: ExerciseEntry[];
};

type Step = 1 | 2 | 3 | 4;

const MUSCLE_GROUP_LABELS: Record<string, string> = {
  chest: "Pectoraux",
  back: "Dos",
  shoulders: "Épaules",
  biceps: "Biceps",
  triceps: "Triceps",
  quads: "Quadriceps",
  hamstrings: "Ischio-jambiers",
  glutes: "Fessiers",
  calves: "Mollets",
  core: "Abdominaux",
  other: "Autre",
};

function defaultExercise(exercise_id: string): ExerciseEntry {
  return {
    exercise_id,
    target_sets: 3,
    target_reps_min: 8,
    target_reps_max: 12,
    rest_seconds: 90,
  };
}

export default function ProgramForm({ exercises, hasCouple }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [step, setStep] = useState<Step>(1);
  const [name, setName] = useState("");
  const [scope, setScope] = useState<"individual" | "couple">("individual");
  const [days, setDays] = useState<DayEntry[]>([{ name: "", exercises: [] }]);
  const [error, setError] = useState<string | null>(null);

  // Step 3 state: which day is currently being edited
  const [editingDayIndex, setEditingDayIndex] = useState(0);

  const exercisesByMuscle = exercises.reduce<
    Record<string, SystemExercise[]>
  >((acc, ex) => {
    const group = ex.muscle_group;
    if (!acc[group]) acc[group] = [];
    acc[group].push(ex);
    return acc;
  }, {});

  function addDay() {
    setDays((prev) => [...prev, { name: "", exercises: [] }]);
  }

  function removeDay(index: number) {
    setDays((prev) => prev.filter((_, i) => i !== index));
    if (editingDayIndex >= days.length - 1) {
      setEditingDayIndex(Math.max(0, days.length - 2));
    }
  }

  function updateDayName(index: number, value: string) {
    setDays((prev) =>
      prev.map((d, i) => (i === index ? { ...d, name: value } : d)),
    );
  }

  function addExerciseToDay(dayIndex: number, exercise_id: string) {
    const already = days[dayIndex].exercises.some(
      (e) => e.exercise_id === exercise_id,
    );
    if (already) return;
    setDays((prev) =>
      prev.map((d, i) =>
        i === dayIndex
          ? { ...d, exercises: [...d.exercises, defaultExercise(exercise_id)] }
          : d,
      ),
    );
  }

  function removeExerciseFromDay(dayIndex: number, exIndex: number) {
    setDays((prev) =>
      prev.map((d, i) =>
        i === dayIndex
          ? { ...d, exercises: d.exercises.filter((_, ei) => ei !== exIndex) }
          : d,
      ),
    );
  }

  function updateExercise(
    dayIndex: number,
    exIndex: number,
    field: keyof ExerciseEntry,
    value: number | string,
  ) {
    setDays((prev) =>
      prev.map((d, i) =>
        i === dayIndex
          ? {
              ...d,
              exercises: d.exercises.map((e, ei) =>
                ei === exIndex ? { ...e, [field]: value } : e,
              ),
            }
          : d,
      ),
    );
  }

  function validateStep1(): string | null {
    if (!name.trim()) return "Le nom du programme est requis";
    return null;
  }

  function validateStep2(): string | null {
    if (days.length === 0) return "Ajoute au moins un jour";
    for (let i = 0; i < days.length; i++) {
      if (!days[i].name.trim()) return `Le jour ${i + 1} doit avoir un nom`;
    }
    return null;
  }

  function validateStep3(): string | null {
    for (let i = 0; i < days.length; i++) {
      if (days[i].exercises.length === 0) {
        return `Le jour "${days[i].name}" doit avoir au moins un exercice`;
      }
    }
    return null;
  }

  function goToStep(next: Step) {
    setError(null);
    setStep(next);
  }

  function handleStep1Next() {
    const err = validateStep1();
    if (err) { setError(err); return; }
    goToStep(2);
  }

  function handleStep2Next() {
    const err = validateStep2();
    if (err) { setError(err); return; }
    setEditingDayIndex(0);
    goToStep(3);
  }

  function handleStep3Next() {
    const err = validateStep3();
    if (err) { setError(err); return; }
    goToStep(4);
  }

  function handleSubmit() {
    setError(null);
    startTransition(async () => {
      const result = await createProgram({
        name: name.trim(),
        scope,
        days: days.map((d, dayIdx) => ({
          name: d.name.trim(),
          exercises: d.exercises.map((e, exIdx) => ({
            ...e,
            order_index: exIdx,
          })),
        })),
      });

      if (!result.success) {
        setError(result.error);
        return;
      }

      router.push("/dashboard");
    });
  }

  function getExerciseName(exercise_id: string): string {
    return exercises.find((e) => e.id === exercise_id)?.name ?? exercise_id;
  }

  return (
    <div className="min-h-screen p-4">
      <div className="mx-auto max-w-lg">
        {/* Progress indicator */}
        <div className="mb-6 flex gap-2">
          {([1, 2, 3, 4] as Step[]).map((s) => (
            <div
              key={s}
              className={`h-1 flex-1 rounded-full transition-colors ${
                s <= step ? "bg-toi" : "bg-zinc-700"
              }`}
            />
          ))}
        </div>

        {/* Step 1 — Name + scope */}
        {step === 1 && (
          <div className="space-y-6">
            <h1 className="text-xl font-bold">Nouveau programme</h1>

            <div className="space-y-2">
              <label className="block text-sm text-zinc-400">
                Nom du programme
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="ex. PPL A/B, Full Body…"
                className="w-full rounded-lg bg-zinc-800 px-4 py-3 text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-toi"
              />
            </div>

            <div className="space-y-2">
              <label className="block text-sm text-zinc-400">Portée</label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setScope("individual")}
                  className={`rounded-lg border-2 p-4 text-left transition-colors ${
                    scope === "individual"
                      ? "border-toi bg-toi/10"
                      : "border-zinc-700 bg-zinc-800"
                  }`}
                >
                  <div className="font-medium">Individuel</div>
                  <div className="mt-1 text-xs text-zinc-400">
                    Visible par toi uniquement
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => setScope("couple")}
                  disabled={!hasCouple}
                  className={`rounded-lg border-2 p-4 text-left transition-colors disabled:opacity-40 ${
                    scope === "couple"
                      ? "border-elle bg-elle/10"
                      : "border-zinc-700 bg-zinc-800"
                  }`}
                >
                  <div className="font-medium">Partagé</div>
                  <div className="mt-1 text-xs text-zinc-400">
                    {hasCouple
                      ? "Visible par vous deux"
                      : "Nécessite un partenaire"}
                  </div>
                </button>
              </div>
            </div>

            {error && <p className="text-sm text-red-400">{error}</p>}

            <button
              type="button"
              onClick={handleStep1Next}
              className="w-full rounded-lg bg-toi py-3 font-semibold text-white"
            >
              Suivant
            </button>
          </div>
        )}

        {/* Step 2 — Days */}
        {step === 2 && (
          <div className="space-y-6">
            <div>
              <h1 className="text-xl font-bold">Jours d&apos;entraînement</h1>
              <p className="mt-1 text-sm text-zinc-400">
                Ajoute les séances de ton programme
              </p>
            </div>

            <div className="space-y-3">
              {days.map((day, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="w-6 shrink-0 text-center text-sm text-zinc-500">
                    {i + 1}
                  </span>
                  <input
                    type="text"
                    value={day.name}
                    onChange={(e) => updateDayName(i, e.target.value)}
                    placeholder={`ex. Upper A, Lower B, Jour ${i + 1}…`}
                    className="flex-1 rounded-lg bg-zinc-800 px-3 py-2 text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-toi"
                  />
                  {days.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeDay(i)}
                      className="rounded px-2 py-1 text-zinc-500 hover:text-red-400"
                      aria-label="Supprimer ce jour"
                    >
                      ✕
                    </button>
                  )}
                </div>
              ))}
            </div>

            <button
              type="button"
              onClick={addDay}
              className="w-full rounded-lg border border-dashed border-zinc-600 py-3 text-sm text-zinc-400 hover:border-zinc-400 hover:text-zinc-200"
            >
              + Ajouter un jour
            </button>

            {error && <p className="text-sm text-red-400">{error}</p>}

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => goToStep(1)}
                className="flex-1 rounded-lg bg-zinc-800 py-3 font-semibold text-zinc-300"
              >
                Retour
              </button>
              <button
                type="button"
                onClick={handleStep2Next}
                className="flex-1 rounded-lg bg-toi py-3 font-semibold text-white"
              >
                Suivant
              </button>
            </div>
          </div>
        )}

        {/* Step 3 — Exercises per day */}
        {step === 3 && (
          <div className="space-y-5">
            <div>
              <h1 className="text-xl font-bold">Exercices</h1>
              <p className="mt-1 text-sm text-zinc-400">
                Ajoute les exercices pour chaque jour
              </p>
            </div>

            {/* Day selector */}
            <div className="flex gap-2 overflow-x-auto pb-1">
              {days.map((day, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setEditingDayIndex(i)}
                  className={`shrink-0 rounded-full px-3 py-1 text-sm font-medium transition-colors ${
                    editingDayIndex === i
                      ? "bg-toi text-white"
                      : "bg-zinc-800 text-zinc-400"
                  }`}
                >
                  {day.name || `Jour ${i + 1}`}
                </button>
              ))}
            </div>

            {/* Current day exercises */}
            <div className="space-y-2">
              {days[editingDayIndex].exercises.length === 0 && (
                <p className="rounded-lg bg-zinc-900 p-4 text-center text-sm text-zinc-500">
                  Aucun exercice — choisis dans le catalogue ci-dessous
                </p>
              )}
              {days[editingDayIndex].exercises.map((ex, exIdx) => (
                <div key={exIdx} className="rounded-lg bg-zinc-900 p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">
                      {getExerciseName(ex.exercise_id)}
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        removeExerciseFromDay(editingDayIndex, exIdx)
                      }
                      className="text-xs text-zinc-500 hover:text-red-400"
                    >
                      Retirer
                    </button>
                  </div>
                  <div className="mt-2 grid grid-cols-4 gap-2 text-xs text-zinc-400">
                    <div>
                      <div>Séries</div>
                      <input
                        type="number"
                        min={1}
                        max={10}
                        value={ex.target_sets}
                        onChange={(e) =>
                          updateExercise(
                            editingDayIndex,
                            exIdx,
                            "target_sets",
                            parseInt(e.target.value, 10) || 1,
                          )
                        }
                        className="mt-1 w-full rounded bg-zinc-800 px-2 py-1 text-white focus:outline-none focus:ring-1 focus:ring-toi"
                      />
                    </div>
                    <div>
                      <div>Reps min</div>
                      <input
                        type="number"
                        min={1}
                        max={100}
                        value={ex.target_reps_min}
                        onChange={(e) =>
                          updateExercise(
                            editingDayIndex,
                            exIdx,
                            "target_reps_min",
                            parseInt(e.target.value, 10) || 1,
                          )
                        }
                        className="mt-1 w-full rounded bg-zinc-800 px-2 py-1 text-white focus:outline-none focus:ring-1 focus:ring-toi"
                      />
                    </div>
                    <div>
                      <div>Reps max</div>
                      <input
                        type="number"
                        min={1}
                        max={100}
                        value={ex.target_reps_max}
                        onChange={(e) =>
                          updateExercise(
                            editingDayIndex,
                            exIdx,
                            "target_reps_max",
                            parseInt(e.target.value, 10) || 1,
                          )
                        }
                        className="mt-1 w-full rounded bg-zinc-800 px-2 py-1 text-white focus:outline-none focus:ring-1 focus:ring-toi"
                      />
                    </div>
                    <div>
                      <div>Repos (s)</div>
                      <input
                        type="number"
                        min={0}
                        max={600}
                        step={15}
                        value={ex.rest_seconds}
                        onChange={(e) =>
                          updateExercise(
                            editingDayIndex,
                            exIdx,
                            "rest_seconds",
                            parseInt(e.target.value, 10) || 0,
                          )
                        }
                        className="mt-1 w-full rounded bg-zinc-800 px-2 py-1 text-white focus:outline-none focus:ring-1 focus:ring-toi"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Exercise catalog */}
            <details className="group rounded-lg bg-zinc-900">
              <summary className="cursor-pointer select-none p-3 text-sm font-medium text-zinc-300 marker:content-none group-open:border-b group-open:border-zinc-800">
                Catalogue d&apos;exercices{" "}
                <span className="text-zinc-500">({exercises.length})</span>
              </summary>
              <div className="max-h-64 overflow-y-auto p-2">
                {Object.entries(exercisesByMuscle).map(([group, exList]) => (
                  <div key={group} className="mb-3">
                    <div className="mb-1 px-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                      {MUSCLE_GROUP_LABELS[group] ?? group}
                    </div>
                    <div className="space-y-1">
                      {exList.map((ex) => {
                        const alreadyAdded = days[
                          editingDayIndex
                        ].exercises.some((e) => e.exercise_id === ex.id);
                        return (
                          <button
                            key={ex.id}
                            type="button"
                            onClick={() =>
                              addExerciseToDay(editingDayIndex, ex.id)
                            }
                            disabled={alreadyAdded}
                            className={`flex w-full items-center justify-between rounded px-3 py-2 text-left text-sm transition-colors ${
                              alreadyAdded
                                ? "text-zinc-600"
                                : "text-zinc-300 hover:bg-zinc-800"
                            }`}
                          >
                            <span>{ex.name}</span>
                            {alreadyAdded ? (
                              <span className="text-xs text-toi">✓</span>
                            ) : (
                              <span className="text-xs text-zinc-500">+</span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </details>

            {error && <p className="text-sm text-red-400">{error}</p>}

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => goToStep(2)}
                className="flex-1 rounded-lg bg-zinc-800 py-3 font-semibold text-zinc-300"
              >
                Retour
              </button>
              <button
                type="button"
                onClick={handleStep3Next}
                className="flex-1 rounded-lg bg-toi py-3 font-semibold text-white"
              >
                Suivant
              </button>
            </div>
          </div>
        )}

        {/* Step 4 — Summary + submit */}
        {step === 4 && (
          <div className="space-y-6">
            <div>
              <h1 className="text-xl font-bold">Récapitulatif</h1>
              <p className="mt-1 text-sm text-zinc-400">
                Vérifie ton programme avant de le créer
              </p>
            </div>

            <div className="rounded-lg bg-zinc-900 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-zinc-400 text-sm">Nom</span>
                <span className="font-medium">{name}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-zinc-400 text-sm">Portée</span>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                    scope === "couple"
                      ? "bg-elle/20 text-elle"
                      : "bg-toi/20 text-toi"
                  }`}
                >
                  {scope === "couple" ? "Partagé" : "Individuel"}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-zinc-400 text-sm">Jours</span>
                <span className="font-medium">{days.length}</span>
              </div>
            </div>

            <div className="space-y-3">
              {days.map((day, i) => (
                <div key={i} className="rounded-lg bg-zinc-900 p-3">
                  <div className="font-medium text-sm mb-2">
                    {i + 1}. {day.name}
                  </div>
                  <ul className="space-y-1">
                    {day.exercises.map((ex, ei) => (
                      <li
                        key={ei}
                        className="flex items-center justify-between text-xs text-zinc-400"
                      >
                        <span>{getExerciseName(ex.exercise_id)}</span>
                        <span>
                          {ex.target_sets}×{ex.target_reps_min}–
                          {ex.target_reps_max} · {ex.rest_seconds}s
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>

            {error && <p className="text-sm text-red-400">{error}</p>}

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => goToStep(3)}
                disabled={isPending}
                className="flex-1 rounded-lg bg-zinc-800 py-3 font-semibold text-zinc-300 disabled:opacity-50"
              >
                Retour
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={isPending}
                className="flex-1 rounded-lg bg-toi py-3 font-semibold text-white disabled:opacity-50"
              >
                {isPending ? "Création…" : "Créer le programme"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
