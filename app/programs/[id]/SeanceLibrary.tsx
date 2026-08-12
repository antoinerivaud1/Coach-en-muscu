"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  createSeance,
  deleteSeance,
  duplicateSeance,
  moveSeance,
  startSession,
  type SeanceActionResult,
} from "./actions";

export type SeanceExerciseView = {
  id: string;
  name: string;
  groupLabel: string;
  targetSets: number;
  repsMin: number;
  repsMax: number;
};

export type SeanceView = {
  id: string;
  name: string;
  exerciseCount: number;
  setCount: number;
  tags: string[];
  extraTags: number;
  exercises: SeanceExerciseView[];
};

const NEW_SEANCE_KEY = "__new__";

export default function SeanceLibrary({
  programId,
  seances,
}: {
  programId: string;
  seances: SeanceView[];
}) {
  const router = useRouter();
  const [isPending, startAction] = useTransition();
  const [newName, setNewName] = useState("");
  /** Erreur courante, rattachée à l'id de la séance concernée. */
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  /** Séance dont la suppression attend une confirmation, rendue dans le DOM. */
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  function run(key: string, action: () => Promise<SeanceActionResult>) {
    setErrorKey(null);
    setErrorMessage(null);
    setBusyId(key);
    startAction(async () => {
      const result = await action();
      setBusyId(null);
      setConfirmingId(null);
      if (!result.success) {
        setErrorKey(key);
        setErrorMessage(result.error);
        return;
      }
      router.refresh();
    });
  }

  function handleCreate() {
    const name = newName.trim();
    if (!name) {
      setErrorKey(NEW_SEANCE_KEY);
      setErrorMessage("Le nom de la séance est obligatoire");
      return;
    }
    run(NEW_SEANCE_KEY, async () => {
      const result = await createSeance({ programId, name });
      if (result.success) setNewName("");
      return result;
    });
  }

  /**
   * CM-70 : la confirmation passait par `window.confirm()`. Ce dialogue natif
   * est supprimé (et renvoie donc `false`) dans une web app iOS en
   * `display: standalone` comme dans la WKWebView Capacitor — les deux
   * contextes de cette app. `handleDelete` sortait avant même d'appeler la
   * server action : aucune requête, aucune erreur, aucun message. La
   * confirmation est désormais rendue dans le DOM (voir `confirmingId`).
   */
  function handleDelete(seance: SeanceView) {
    run(seance.id, () => deleteSeance(seance.id));
  }

  return (
    <div className="space-y-4">
      {/* Ajouter une séance */}
      <section className="rounded-2xl border border-line bg-surface p-4">
        <h2 className="text-sm font-extrabold uppercase tracking-[0.12em] text-fg-muted">
          Nouvelle séance
        </h2>
        <div className="mt-3 flex gap-2">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="ex. Dos, Push, Jambes…"
            aria-label="Nom de la séance"
            className="min-w-0 flex-1 rounded-xl bg-surface2 px-3 py-2.5 text-fg placeholder-fg-faint focus:outline-none focus:ring-2 focus:ring-energy"
          />
          <button
            type="button"
            onClick={handleCreate}
            disabled={isPending}
            className="shrink-0 rounded-xl bg-energy px-4 py-2.5 text-sm font-extrabold text-ink disabled:opacity-50"
          >
            Ajouter
          </button>
        </div>
        {errorKey === NEW_SEANCE_KEY && errorMessage && (
          <p
            role="alert"
            className="mt-2 rounded-lg border border-red-400/40 bg-red-400/10 px-3 py-2 text-sm text-red-400"
          >
            {errorMessage}
          </p>
        )}
      </section>

      {seances.length === 0 && (
        <p className="rounded-2xl border border-dashed border-line bg-surface p-6 text-center text-sm text-fg-muted">
          Aucune séance dans la bibliothèque. Crée ta première séance ci-dessus.
        </p>
      )}

      {seances.map((seance, index) => {
        const isEmpty = seance.exerciseCount === 0;
        const busy = busyId === seance.id && isPending;
        return (
          <section
            key={seance.id}
            className={`rounded-2xl border p-4 ${
              isEmpty
                ? "border-dashed border-flame/40 bg-surface/60"
                : "border-line bg-surface"
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="truncate text-lg font-extrabold text-fg">
                  {seance.name}
                </h2>
                <p className="mt-0.5 text-xs font-semibold text-fg-muted">
                  {isEmpty
                    ? "Séance vide"
                    : `${seance.exerciseCount} exercice${
                        seance.exerciseCount > 1 ? "s" : ""
                      } · ${seance.setCount} série${seance.setCount > 1 ? "s" : ""}`}
                </p>
              </div>
              <form action={startSession} className="shrink-0">
                <input type="hidden" name="day_id" value={seance.id} />
                <button
                  type="submit"
                  disabled={isEmpty}
                  title={
                    isEmpty ? "Ajoute au moins un exercice pour démarrer" : undefined
                  }
                  className="rounded-xl bg-energy px-4 py-2 text-sm font-extrabold text-ink disabled:opacity-40"
                >
                  Démarrer
                </button>
              </form>
            </div>

            {seance.tags.length > 0 && (
              <div className="mt-2.5 flex flex-wrap gap-1.5">
                {seance.tags.map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full border border-line bg-surface2 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-fg-muted"
                  >
                    {tag}
                  </span>
                ))}
                {seance.extraTags > 0 && (
                  <span className="rounded-full border border-line bg-surface2 px-2.5 py-1 text-[11px] font-bold text-fg-muted">
                    +{seance.extraTags}
                  </span>
                )}
              </div>
            )}

            {isEmpty ? (
              <p className="mt-3 rounded-xl border border-flame/30 bg-flame/10 px-3 py-2 text-sm text-flame">
                Cette séance n&apos;a aucun exercice : elle ne peut pas être
                démarrée. Ajoute au moins un exercice via « Modifier les
                exercices », en haut de la page.
              </p>
            ) : (
              <ul className="mt-3 space-y-2">
                {seance.exercises.map((ex) => (
                  <li
                    key={ex.id}
                    className="flex items-center justify-between gap-3 border-t border-line pt-2 text-sm first:border-0 first:pt-0"
                  >
                    <div className="min-w-0">
                      <span className="text-fg">{ex.name}</span>
                      <span className="ml-2 text-xs text-fg-muted">
                        {ex.groupLabel}
                      </span>
                    </div>
                    <span className="shrink-0 text-xs text-fg-muted">
                      {ex.targetSets}×{ex.repsMin}–{ex.repsMax}
                    </span>
                  </li>
                ))}
              </ul>
            )}

            <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-3">
              <button
                type="button"
                onClick={() => run(seance.id, () => moveSeance(seance.id, "up"))}
                disabled={index === 0 || isPending}
                aria-label={`Monter la séance ${seance.name}`}
                className="rounded-lg bg-surface2 px-3 py-2 text-sm font-bold text-fg disabled:opacity-30"
              >
                ↑
              </button>
              <button
                type="button"
                onClick={() =>
                  run(seance.id, () => moveSeance(seance.id, "down"))
                }
                disabled={index === seances.length - 1 || isPending}
                aria-label={`Descendre la séance ${seance.name}`}
                className="rounded-lg bg-surface2 px-3 py-2 text-sm font-bold text-fg disabled:opacity-30"
              >
                ↓
              </button>
              <span className="flex-1" />
              <button
                type="button"
                onClick={() => run(seance.id, () => duplicateSeance(seance.id))}
                disabled={isPending}
                className="rounded-lg bg-surface2 px-3 py-2 text-sm font-semibold text-fg disabled:opacity-50"
              >
                {busy ? "…" : "Dupliquer"}
              </button>
              <button
                type="button"
                onClick={() =>
                  setConfirmingId((prev) =>
                    prev === seance.id ? null : seance.id,
                  )
                }
                disabled={isPending}
                aria-expanded={confirmingId === seance.id}
                className="rounded-lg bg-surface2 px-3 py-2 text-sm font-semibold text-red-400 disabled:opacity-50"
              >
                Supprimer
              </button>
            </div>

            {confirmingId === seance.id && (
              <div className="mt-3 rounded-xl border border-flame/40 bg-flame/10 p-3">
                <p className="text-sm font-semibold text-flame">
                  Supprimer la séance « {seance.name} » ? Cette action est
                  définitive.
                </p>
                <div className="mt-2.5 flex gap-2">
                  <button
                    type="button"
                    onClick={() => setConfirmingId(null)}
                    disabled={isPending}
                    className="flex-1 rounded-lg bg-surface2 py-2 text-sm font-semibold text-fg disabled:opacity-50"
                  >
                    Annuler
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(seance)}
                    disabled={isPending}
                    className="flex-1 rounded-lg bg-flame py-2 text-sm font-extrabold text-ink disabled:opacity-50"
                  >
                    {busy ? "Suppression…" : "Oui, supprimer"}
                  </button>
                </div>
              </div>
            )}

            {errorKey === seance.id && errorMessage && (
              <p
                role="alert"
                className="mt-2 rounded-lg border border-red-400/40 bg-red-400/10 px-3 py-2 text-sm text-red-400"
              >
                {errorMessage}
              </p>
            )}
          </section>
        );
      })}
    </div>
  );
}
