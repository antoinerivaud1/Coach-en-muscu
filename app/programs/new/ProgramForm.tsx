"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createProgram, createCustomExercise, updateProgram } from "./actions";
import type { SystemExercise } from "@/lib/queries/exercises";

type Props = {
  exercises: SystemExercise[];
  hasCouple: boolean;
  canCreateExercise: boolean;
  mode?: "create" | "edit";
  programId?: string;
  initialName?: string;
  initialScope?: "individual" | "couple";
  initialDays?: DayEntry[];
};

type ExerciseEntry = {
  exercise_id: string;
  target_sets: number;
  target_reps_min: number;
  target_reps_max: number;
  rest_seconds: number;
};

type DayEntry = {
  id?: string;
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

export default function ProgramForm({
  exercises,
  hasCouple,
  canCreateExercise,
  mode = "create",
  programId,
  initialName,
  initialScope,
  initialDays,
}: Props) {
  const isEdit = mode === "edit";
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isCreating, startCreate] = useTransition();

  const [catalog, setCatalog] = useState<SystemExercise[]>(exercises);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newGroup, setNewGroup] =
    useState<SystemExercise["muscle_group"]>("chest");
  const [createError, setCreateError] = useState<string | null>(null);

  const [step, setStep] = useState<Step>(1);
  const [name, setName] = useState(initialName ?? "");
  const [scope, setScope] = useState<"individual" | "couple">(
    initialScope ?? "individual",
  );
  const [days, setDays] = useState<DayEntry[]>(
    initialDays && initialDays.length > 0
      ? initialDays
      : [{ name: "", exercises: [] }],
  );
  const [error, setError] = useState<string | null>(null);

  // Step 3 state: which day is currently being edited
  const [editingDayIndex, setEditingDayIndex] = useState(0);

  const exercisesByMuscle = catalog.reduce<
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
      const mappedDays = days.map((d) => ({
        id: d.id,
        name: d.name.trim(),
        exercises: d.exercises.map((e, exIdx) => ({
          ...e,
          order_index: exIdx,
        })),
      }));

      const result =
        isEdit && programId
          ? await updateProgram({
              programId,
              name: name.trim(),
              scope,
              days: mappedDays,
            })
          : await createProgram({
              name: name.trim(),
              scope,
              days: mappedDays.map((d) => ({
                name: d.name,
                exercises: d.exercises,
              })),
            });

      if (!result.success) {
        setError(result.error);
        return;
      }

      router.push(isEdit && programId ? `/programs/${programId}` : "/dashboard");
    });
  }

  function handleCreateExercise() {
    setCreateError(null);
    const trimmed = newName.trim();
    if (!trimmed) {
      setCreateError("Le nom est requis");
      return;
    }
    startCreate(async () => {
      const result = await createCustomExercise({
        name: trimmed,
        muscle_group: newGroup,
      });
      if (!result.success) {
        setCreateError(result.error);
        return;
      }
      setCatalog((prev) => [...prev, result.exercise]);
      addExerciseToDay(editingDayIndex, result.exercise.id);
      setNewName("");
      setShowCreate(false);
    });
  }

  function getExerciseName(exercise_id: string): string {
    return catalog.find((e) => e.id === exercise_id)?.name ?? exercise_id;
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
                s <= step ? "bg-toi" : "bg-surface2"
              }`}
            />
          ))}
        </div>

        {/* Step 1 — Name + scope */}
        {step === 1 && (
          <div className="space-y-6">
            <h1 className="text-xl font-bold">
              {isEdit ? "Modifier le programme" : "Nouveau programme"}
            </h1>

            <div className="space-y-2">
              <label className="block text-sm text-fg-muted">
                Nom du programme
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="ex. PPL A/B, Full Body…"
                className="w-full rounded-lg bg-surface2 px-4 py-3 text-white placeholder-fg-faint focus:outline-none focus:ring-2 focus:ring-toi"
              />
            </div>

            <div className="space-y-2">
              <label className="block text-sm text-fg-muted">Portée</label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setScope("individual")}
                  className={`rounded-lg border-2 p-4 text-left transition-colors ${
                    scope === "individual"
                      ? "border-toi bg-toi/10"
                      : "border-line bg-surface2"
                  }`}
                >
                  <div className="font-medium">Individuel</div>
                  <div className="mt-1 text-xs text-fg-muted">
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
                      : "border-line bg-surface2"
                  }`}
                >
                  <div className="font-medium">Partagé</div>
                  <div className="mt-1 text-xs text-fg-muted">
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
              <p className="mt-1 text-sm text-fg-muted">
                Ajoute les séances de ton programme
              </p>
            </div>

            <div className="space-y-3">
              {days.map((day, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="w-6 shrink-0 text-center text-sm text-fg-muted">
                    {i + 1}
                  </span>
                  <input
                    type="text"
                    value={day.name}
                    onChange={(e) => updateDayName(i, e.target.value)}
                    placeholder={`ex. Upper A, Lower B, Jour ${i + 1}…`}
                    className="flex-1 rounded-lg bg-surface2 px-3 py-2 text-white placeholder-fg-faint focus:outline-none focus:ring-2 focus:ring-toi"
                  />
                  {days.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeDay(i)}
                      className="rounded px-2 py-1 text-fg-muted hover:text-red-400"
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
              className="w-full rounded-lg border border-dashed border-line py-3 text-sm text-fg-muted hover:border-white/25 hover:text-fg"
            >
              + Ajouter un jour
            </button>

            {error && <p className="text-sm text-red-400">{error}</p>}

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => goToStep(1)}
                className="flex-1 rounded-lg bg-surface2 py-3 font-semibold text-fg"
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
              <p className="mt-1 text-sm text-fg-muted">
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
                      : "bg-surface2 text-fg-muted"
                  }`}
                >
                  {day.name || `Jour ${i + 1}`}
                </button>
              ))}
            </div>

            {/* Current day exercises */}
            <div className="space-y-2">
              {days[editingDayIndex].exercises.length === 0 && (
                <p className="rounded-lg bg-surface p-4 text-center text-sm text-fg-muted">
                  Aucun exercice — choisis dans le catalogue ci-dessous
                </p>
              )}
              {days[editingDayIndex].exercises.map((ex, exIdx) => (
                <div key={exIdx} className="rounded-lg bg-surface p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">
                      {getExerciseName(ex.exercise_id)}
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        removeExerciseFromDay(editingDayIndex, exIdx)
                      }
                      className="text-xs text-fg-muted hover:text-red-400"
                    >
                      Retirer
                    </button>
                  </div>
                  <div className="mt-2 grid grid-cols-4 gap-2 text-xs text-fg-muted">
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
                        className="mt-1 w-full rounded bg-surface2 px-2 py-1 text-white focus:outline-none focus:ring-1 focus:ring-toi"
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
                        className="mt-1 w-full rounded bg-surface2 px-2 py-1 text-white focus:outline-none focus:ring-1 focus:ring-toi"
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
                        className="mt-1 w-full rounded bg-surface2 px-2 py-1 text-white focus:outline-none focus:ring-1 focus:ring-toi"
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
                        className="mt-1 w-full rounded bg-surface2 px-2 py-1 text-white focus:outline-none focus:ring-1 focus:ring-toi"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Exercise catalog */}
            <details className="group rounded-lg bg-surface">
              <summary className="cursor-pointer select-none p-3 text-sm font-medium text-fg marker:content-none group-open:border-b group-open:border-line">
                Catalogue d&apos;exercices{" "}
                <span className="text-fg-muted">({catalog.length})</span>
              </summary>
              <div className="max-h-64 overflow-y-auto p-2">
                {canCreateExercise && (
                  <div className="mb-3 border-b border-line pb-3">
                    {!showCreate ? (
                      <button
                        type="button"
                        onClick={() => {
                          setShowCreate(true);
                          setCreateError(null);
                        }}
                        className="w-full rounded px-3 py-2 text-left text-sm font-medium text-toi hover:bg-surface2"
                      >
                        + Créer un exercice
                      </button>
                    ) : (
                      <div className="space-y-2 px-1">
                        <input
                          type="text"
                          value={newName}
                          onChange={(e) => setNewName(e.target.value)}
                          placeholder="Nom de l'exercice"
                          className="w-full rounded bg-surface2 px-3 py-2 text-sm text-white placeholder-fg-faint focus:outline-none focus:ring-1 focus:ring-toi"
                        />
                        <select
                          value={newGroup}
                          onChange={(e) =>
                            setNewGroup(
                              e.target.value as SystemExercise["muscle_group"],
                            )
                          }
                          className="w-full rounded bg-surface2 px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-toi"
                        >
                          {Object.entries(MUSCLE_GROUP_LABELS).map(
                            ([value, label]) => (
                              <option key={value} value={value}>
                                {label}
                              </option>
                            ),
                          )}
                        </select>
                        {createError && (
                          <p className="text-xs text-red-400">{createError}</p>
                        )}
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setShowCreate(false);
                              setNewName("");
                              setCreateError(null);
                            }}
                            className="flex-1 rounded bg-surface2 py-2 text-xs font-medium text-fg"
                          >
                            Annuler
                          </button>
                          <button
                            type="button"
                            onClick={handleCreateExercise}
                            disabled={isCreating}
                            className="flex-1 rounded bg-toi py-2 text-xs font-semibold text-white disabled:opacity-50"
                          >
                            {isCreating ? "Création…" : "Ajouter au jour"}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
                {Object.entries(exercisesByMuscle).map(([group, exList]) => (
                  <div key={group} className="mb-3">
                    <div className="mb-1 px-2 text-xs font-semibold uppercase tracking-wide text-fg-muted">
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
                                ? "text-fg-faint"
                                : "text-fg hover:bg-surface2"
                            }`}
                          >
                            <span>{ex.name}</span>
                            {alreadyAdded ? (
                              <span className="text-xs text-toi">✓</span>
                            ) : (
                              <span className="text-xs text-fg-muted">+</span>
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
                className="flex-1 rounded-lg bg-surface2 py-3 font-semibold text-fg"
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
              <p className="mt-1 text-sm text-fg-muted">
                Vérifie ton programme avant de le créer
              </p>
            </div>

            <div className="rounded-lg bg-surface p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-fg-muted text-sm">Nom</span>
                <span className="font-medium">{name}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-fg-muted text-sm">Portée</span>
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
                <span className="text-fg-muted text-sm">Jours</span>
                <span className="font-medium">{days.length}</span>
              </div>
            </div>

            <div className="space-y-3">
              {days.map((day, i) => (
                <div key={i} className="rounded-lg bg-surface p-3">
                  <div className="font-medium text-sm mb-2">
                    {i + 1}. {day.name}
                  </div>
                  <ul className="space-y-1">
                    {day.exercises.map((ex, ei) => (
                      <li
                        key={ei}
                        className="flex items-center justify-between text-xs text-fg-muted"
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
                className="flex-1 rounded-lg bg-surface2 py-3 font-semibold text-fg disabled:opacity-50"
              >
                Retour
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={isPending}
                className="flex-1 rounded-lg bg-toi py-3 font-semibold text-white disabled:opacity-50"
              >
                {isPending
                  ? "Enregistrement…"
                  : isEdit
                    ? "Enregistrer"
                    : "Créer le programme"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
