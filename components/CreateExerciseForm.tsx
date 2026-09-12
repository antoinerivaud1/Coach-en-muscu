"use client";

import { useState, useTransition } from "react";
import { createCustomExercise } from "@/app/programs/new/actions";
import type { SystemExercise } from "@/lib/queries/exercises";
import { MUSCLE_GROUP_LABELS } from "@/lib/utils/training";

/**
 * Formulaire de création d'un exercice perso du couple (CM-13).
 *
 * Extrait du builder de programme pour être partagé tel quel avec l'ajout
 * d'exercice en cours de séance (CM-62) : un seul formulaire, une seule action
 * serveur (`createCustomExercise`), aucun duplicata à maintenir en double.
 * Le parent décide seulement de ce qu'il fait de l'exercice créé.
 */
export default function CreateExerciseForm({
  submitLabel = "Créer l'exercice",
  onCreated,
  onCancel,
}: {
  submitLabel?: string;
  onCreated: (exercise: SystemExercise) => void;
  onCancel: () => void;
}) {
  const [isCreating, startCreate] = useTransition();
  const [name, setName] = useState("");
  const [group, setGroup] = useState<SystemExercise["muscle_group"]>("chest");
  const [error, setError] = useState<string | null>(null);

  function handleSubmit() {
    setError(null);
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Le nom est requis");
      return;
    }
    startCreate(async () => {
      const result = await createCustomExercise({
        name: trimmed,
        muscle_group: group,
      });
      if (!result.success) {
        setError(result.error);
        return;
      }
      setName("");
      onCreated(result.exercise);
    });
  }

  return (
    <div className="space-y-2 px-1">
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Nom de l'exercice"
        className="w-full rounded bg-surface2 px-3 py-2 text-sm text-white placeholder-fg-faint focus:outline-none focus:ring-1 focus:ring-toi"
      />
      <select
        value={group}
        onChange={(e) =>
          setGroup(e.target.value as SystemExercise["muscle_group"])
        }
        className="w-full rounded bg-surface2 px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-toi"
      >
        {Object.entries(MUSCLE_GROUP_LABELS).map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>
      {error && <p className="text-xs text-red-400">{error}</p>}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => {
            setName("");
            setError(null);
            onCancel();
          }}
          className="flex-1 rounded bg-surface2 py-2 text-xs font-medium text-fg"
        >
          Annuler
        </button>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={isCreating}
          className="flex-1 rounded bg-toi py-2 text-xs font-semibold text-white disabled:opacity-50"
        >
          {isCreating ? "Création…" : submitLabel}
        </button>
      </div>
    </div>
  );
}
