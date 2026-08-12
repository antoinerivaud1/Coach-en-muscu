"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateProgramMeta } from "../actions";

export default function ProgramMetaForm({
  programId,
  initialName,
  initialScope,
  hasCouple,
  seanceCount,
}: {
  programId: string;
  initialName: string;
  initialScope: "individual" | "couple";
  hasCouple: boolean;
  seanceCount: number;
}) {
  const router = useRouter();
  const [isPending, startAction] = useTransition();
  const [name, setName] = useState(initialName);
  const [scope, setScope] = useState<"individual" | "couple">(initialScope);
  const [error, setError] = useState<string | null>(null);

  function handleSave() {
    setError(null);
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Le nom du programme est obligatoire");
      return;
    }
    startAction(async () => {
      const result = await updateProgramMeta({
        programId,
        name: trimmed,
        scope,
      });
      if (!result.success) {
        setError(result.error);
        return;
      }
      router.push(`/programs/${programId}`);
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold text-fg">Modifier le programme</h1>

      <div className="space-y-2">
        <label
          htmlFor="program-name"
          className="block text-sm text-fg-muted"
        >
          Nom du programme
        </label>
        <input
          id="program-name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="ex. PPL A/B, Full Body…"
          className="w-full rounded-lg bg-surface2 px-4 py-3 text-fg placeholder-fg-faint focus:outline-none focus:ring-2 focus:ring-energy"
        />
      </div>

      <div className="space-y-2">
        <span className="block text-sm text-fg-muted">Portée</span>
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => setScope("individual")}
            aria-pressed={scope === "individual"}
            className={`rounded-lg border-2 p-4 text-left transition-colors ${
              scope === "individual"
                ? "border-toi bg-toi/10"
                : "border-line bg-surface2"
            }`}
          >
            <div className="font-medium text-fg">Individuel</div>
            <div className="mt-1 text-xs text-fg-muted">
              Visible par toi uniquement
            </div>
          </button>
          <button
            type="button"
            onClick={() => setScope("couple")}
            disabled={!hasCouple}
            aria-pressed={scope === "couple"}
            className={`rounded-lg border-2 p-4 text-left transition-colors disabled:opacity-40 ${
              scope === "couple"
                ? "border-elle bg-elle/10"
                : "border-line bg-surface2"
            }`}
          >
            <div className="font-medium text-fg">Partagé</div>
            <div className="mt-1 text-xs text-fg-muted">
              {hasCouple ? "Visible par vous deux" : "Nécessite un partenaire"}
            </div>
          </button>
        </div>
      </div>

      <p className="rounded-xl border border-line bg-surface p-3 text-sm text-fg-muted">
        {seanceCount === 0
          ? "Les séances se gèrent dans la bibliothèque, sur la page du programme."
          : `Les ${seanceCount} séance${seanceCount > 1 ? "s" : ""} de ce programme se gèrent dans la bibliothèque, sur la page du programme : ajouter, dupliquer, réordonner, supprimer.`}
      </p>

      {error && (
        <p
          role="alert"
          className="rounded-lg border border-red-400/40 bg-red-400/10 px-3 py-2 text-sm text-red-400"
        >
          {error}
        </p>
      )}

      <button
        type="button"
        onClick={handleSave}
        disabled={isPending}
        className="w-full rounded-xl bg-energy py-3 text-sm font-extrabold text-ink disabled:opacity-50"
      >
        {isPending ? "Enregistrement…" : "Enregistrer"}
      </button>
    </div>
  );
}
