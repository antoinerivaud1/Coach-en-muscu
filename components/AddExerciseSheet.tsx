"use client";

import { useMemo, useState } from "react";
import type { SystemExercise } from "@/lib/queries/exercises";
import { MUSCLE_GROUP_LABELS } from "@/lib/utils/training";
import CreateExerciseForm from "@/components/CreateExerciseForm";

/**
 * Bottom sheet d'ajout d'un exercice en cours de séance (CM-62).
 *
 * Le catalogue (exercices système + persos du couple) est chargé côté serveur
 * et passé en prop : le filtrage se fait ici, en mémoire, la liste étant petite.
 * Aucune requête Supabase côté client.
 */
export default function AddExerciseSheet({
  open,
  catalog,
  usedExerciseIds,
  canCreateExercise,
  onSelect,
  onCreated,
  onClose,
}: {
  open: boolean;
  catalog: SystemExercise[];
  /** Exercices déjà dans la séance (programme ou hors programme). */
  usedExerciseIds: readonly string[];
  canCreateExercise: boolean;
  onSelect: (exercise: SystemExercise) => void;
  onCreated: (exercise: SystemExercise) => void;
  onClose: () => void;
}) {
  const [search, setSearch] = useState("");
  const [group, setGroup] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const used = useMemo(() => new Set(usedExerciseIds), [usedExerciseIds]);

  // Chips : uniquement les groupes réellement présents dans le catalogue, dans
  // l'ordre stable des libellés.
  const groups = useMemo(() => {
    const present = new Set(catalog.map((e) => e.muscle_group as string));
    return Object.keys(MUSCLE_GROUP_LABELS).filter((g) => present.has(g));
  }, [catalog]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return catalog.filter((ex) => {
      if (group !== null && ex.muscle_group !== group) return false;
      if (q !== "" && !ex.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [catalog, group, search]);

  if (!open) return null;

  function close() {
    setShowCreate(false);
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60"
      onClick={close}
    >
      <div
        className="flex h-[85dvh] w-full max-w-lg flex-col rounded-t-2xl border-t border-line bg-surface"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Ajouter un exercice"
      >
        <div className="flex items-start justify-between gap-3 px-5 pb-3 pt-4">
          <h2 className="text-lg font-black tracking-tight text-fg">
            Ajouter un exercice
          </h2>
          <button
            type="button"
            onClick={close}
            className="text-fg-muted hover:text-fg"
            aria-label="Fermer"
          >
            ✕
          </button>
        </div>

        {/* Recherche. Pas d'autofocus : sur iOS le clavier s'ouvrirait à
            l'apparition de la sheet et la ferait sauter. */}
        <div className="px-5">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher un exercice"
            className="w-full rounded-xl bg-surface2 px-4 py-2.5 text-sm text-fg placeholder-fg-faint focus:outline-none focus:ring-1 focus:ring-energy"
            aria-label="Rechercher un exercice"
          />
        </div>

        {/* Chips de groupes musculaires : un seul actif à la fois, ou aucun. */}
        <div className="mt-3 flex gap-2 overflow-x-auto px-5 pb-1">
          {groups.map((g) => {
            const active = group === g;
            return (
              <button
                key={g}
                type="button"
                aria-pressed={active}
                onClick={() => setGroup(active ? null : g)}
                className={`flex-none rounded-full px-3 py-1.5 text-xs font-bold ${
                  active
                    ? "bg-energy text-ink"
                    : "border border-line bg-surface2 text-fg-muted"
                }`}
              >
                {MUSCLE_GROUP_LABELS[g] ?? g}
              </button>
            );
          })}
        </div>

        {/* Liste filtrée */}
        <div className="mt-2 flex-1 overflow-y-auto px-5">
          {filtered.length === 0 ? (
            <p className="py-6 text-center text-sm text-fg-muted">
              Aucun exercice ne correspond.
            </p>
          ) : (
            <ul className="flex flex-col gap-1 pb-2">
              {filtered.map((ex) => {
                const alreadyIn = used.has(ex.id);
                return (
                  <li key={ex.id}>
                    <button
                      type="button"
                      disabled={alreadyIn}
                      onClick={() => {
                        onSelect(ex);
                        close();
                      }}
                      className={`flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-left ${
                        alreadyIn
                          ? "text-fg-faint"
                          : "text-fg active:bg-white/5"
                      }`}
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold">
                          {ex.name}
                        </span>
                        <span className="block text-xs text-fg-muted">
                          {MUSCLE_GROUP_LABELS[ex.muscle_group] ??
                            ex.muscle_group}
                        </span>
                      </span>
                      {alreadyIn && (
                        <span className="flex-none text-xs font-semibold">
                          Déjà dans la séance
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Création d'un exercice perso : le formulaire de CM-13, partagé. */}
        {canCreateExercise && (
          <div className="border-t border-line px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            {showCreate ? (
              <CreateExerciseForm
                submitLabel="Ajouter à la séance"
                onCreated={(exercise) => {
                  onCreated(exercise);
                  close();
                }}
                onCancel={() => setShowCreate(false)}
              />
            ) : (
              <button
                type="button"
                onClick={() => setShowCreate(true)}
                className="w-full rounded-xl border border-dashed border-line py-2.5 text-sm font-semibold text-fg-muted active:bg-white/5"
              >
                + Créer un exercice
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
