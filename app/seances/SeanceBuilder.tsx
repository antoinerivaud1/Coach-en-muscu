"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { SystemExercise } from "@/lib/queries/exercises";
import { MUSCLE_GROUP_LABELS } from "@/lib/utils/training";
import {
  SEANCE_DRAFT_LIMITS,
  SEANCE_NAME_MAX_LENGTH,
  clampDraftValue,
  countSets,
  suggestSeanceName,
  uniqueSeanceName,
  validateSeanceName,
  type SeanceDraftExercise,
} from "@/lib/utils/seances";
import { EXTRA_EXERCISE_DEFAULTS } from "@/lib/utils/sessionExercises";
import AddExerciseSheet from "@/components/AddExerciseSheet";
import { saveSeance } from "./actions";

/** Réglage déplié sous une ligne d'exercice. Un seul à la fois sur l'écran. */
type DraftField = "sets" | "reps" | "rest";

/** Compteur en cours de saisie clavier dans le réglage déplié. */
type DirectTarget = "sets" | "repsMin" | "repsMax" | "rest";

type Props = {
  mode: "create" | "edit";
  dayId?: string;
  /** "" en création. */
  initialName: string;
  initialExercises: SeanceDraftExercise[];
  /** Noms des AUTRES séances du programme, pour `validateSeanceName`. */
  otherNames: string[];
  catalog: SystemExercise[];
  canCreateExercise: boolean;
  /** Retour à la bibliothèque (✕ et après enregistrement). */
  backHref: string;
};

/**
 * Écran unique de création / édition d'une séance type (CM-81).
 *
 * Tout tient ici : le nom, la liste d'exercices, leurs cibles, l'ordre. Rien
 * n'est persisté avant le tap sur « Enregistrer » — quitter en cours de route
 * perd le brouillon, et c'est ce que confirme la boîte custom du ✕
 * (`window.confirm` est supprimé en PWA iOS standalone).
 *
 * Le mot « programme » n'apparaît nulle part : le programme partagé du couple
 * est un détail de schéma que la server action gère seule.
 */
export default function SeanceBuilder({
  mode,
  dayId,
  initialName,
  initialExercises,
  otherNames,
  catalog,
  canCreateExercise,
  backHref,
}: Props) {
  const router = useRouter();
  const [isSaving, startSaving] = useTransition();

  const [exercises, setExercises] =
    useState<SeanceDraftExercise[]>(initialExercises);
  const [name, setName] = useState(initialName);
  /**
   * L'utilisateur a-t-il saisi le nom lui-même ? Tant que non, le nom suit la
   * proposition automatique. En édition c'est vrai dès le montage : on ne
   * renomme jamais une séance existante en silence.
   */
  const [nameTouched, setNameTouched] = useState(mode === "edit");
  const [editingName, setEditingName] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);

  const [expanded, setExpanded] = useState<{
    exerciseId: string;
    field: DraftField;
  } | null>(null);
  const [directTarget, setDirectTarget] = useState<DirectTarget | null>(null);

  const [sheetOpen, setSheetOpen] = useState(false);
  const [catalogState, setCatalogState] = useState<SystemExercise[]>(catalog);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const nameInputRef = useRef<HTMLInputElement>(null);
  const cardRefs = useRef(new Map<string, HTMLDivElement | null>());
  /** Exercice vers lequel scroller au prochain rendu (pattern de CM-62). */
  const scrollToId = useRef<string | null>(null);

  const suggestedName = useMemo(
    () =>
      uniqueSeanceName(
        suggestSeanceName(exercises.map((e) => e.muscleGroup)),
        otherNames,
      ),
    [exercises, otherNames],
  );
  /** Le nom affiché : celui de l'utilisateur, sinon la proposition courante. */
  const displayName = nameTouched ? name : suggestedName;
  const showingSuggestion = !nameTouched && suggestedName !== "";

  const usedExerciseIds = useMemo(
    () => exercises.map((e) => e.exerciseId),
    [exercises],
  );
  const setCount = countSets(
    exercises.map((e) => ({ target_sets: e.targetSets })),
  );

  // Scroll doux jusqu'à la carte du nouvel exercice, une fois le rendu fait.
  useEffect(() => {
    const id = scrollToId.current;
    if (!id) return;
    scrollToId.current = null;
    cardRefs.current
      .get(id)
      ?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [exercises]);

  useEffect(() => {
    if (editingName) {
      nameInputRef.current?.focus();
      nameInputRef.current?.select();
    }
  }, [editingName]);

  function touch() {
    setDirty(true);
    setError(null);
  }

  // ----- Nom -----

  function commitName(raw: string) {
    const trimmed = raw.trim();
    setEditingName(false);
    setNameError(null);
    touch();
    if (!trimmed) {
      // Vider le champ à la main rend la main à la proposition automatique.
      setName("");
      setNameTouched(false);
      return;
    }
    setName(trimmed);
    setNameTouched(true);
  }

  // ----- Exercices -----

  function addExercise(exercise: SystemExercise) {
    const added: SeanceDraftExercise = {
      exerciseId: exercise.id,
      name: exercise.name,
      muscleGroup: exercise.muscle_group,
      ...EXTRA_EXERCISE_DEFAULTS,
    };
    setExercises((prev) =>
      prev.some((e) => e.exerciseId === added.exerciseId)
        ? prev
        : [...prev, added],
    );
    scrollToId.current = added.exerciseId;
    touch();
  }

  function removeExercise(exerciseId: string) {
    // Retrait immédiat, sans confirmation : c'est annulable en le rajoutant.
    setExercises((prev) => prev.filter((e) => e.exerciseId !== exerciseId));
    setExpanded((prev) => (prev?.exerciseId === exerciseId ? null : prev));
    touch();
  }

  function moveExercise(index: number, direction: -1 | 1) {
    const to = index + direction;
    setExercises((prev) => {
      if (to < 0 || to >= prev.length) return prev;
      const next = [...prev];
      const [moved] = next.splice(index, 1);
      next.splice(to, 0, moved!);
      return next;
    });
    touch();
  }

  function updateExercise(
    exerciseId: string,
    patch: Partial<SeanceDraftExercise>,
  ) {
    setExercises((prev) =>
      prev.map((e) => (e.exerciseId === exerciseId ? { ...e, ...patch } : e)),
    );
    touch();
  }

  const { sets: SETS, reps: REPS, rest: REST } = SEANCE_DRAFT_LIMITS;

  function setSets(ex: SeanceDraftExercise, value: number) {
    updateExercise(ex.exerciseId, {
      targetSets: clampDraftValue(value, SETS),
    });
  }

  /**
   * Répétitions min / max, en gardant min ≤ max : monter le min au-delà du max
   * pousse le max, et inversement. Sans ça une plage « 12–8 » serait saisissable
   * et refusée seulement à l'enregistrement.
   */
  function setRepsMin(ex: SeanceDraftExercise, value: number) {
    const min = clampDraftValue(value, REPS);
    updateExercise(ex.exerciseId, {
      targetRepsMin: min,
      targetRepsMax: Math.max(min, ex.targetRepsMax),
    });
  }

  function setRepsMax(ex: SeanceDraftExercise, value: number) {
    const max = clampDraftValue(value, REPS);
    updateExercise(ex.exerciseId, {
      targetRepsMax: max,
      targetRepsMin: Math.min(max, ex.targetRepsMin),
    });
  }

  function setRest(ex: SeanceDraftExercise, value: number) {
    updateExercise(ex.exerciseId, {
      restSeconds: clampDraftValue(value, REST),
    });
  }

  function toggleExpanded(exerciseId: string, field: DraftField) {
    setDirectTarget(null);
    setExpanded((prev) =>
      prev?.exerciseId === exerciseId && prev.field === field
        ? null
        : { exerciseId, field },
    );
  }

  // ----- Sortie sans enregistrer -----

  function requestLeave() {
    if (!dirty) {
      router.push(backHref);
      return;
    }
    setConfirmLeave(true);
  }

  // ----- Enregistrement -----

  function save() {
    const check = validateSeanceName(displayName, otherNames);
    if (!check.ok) {
      setNameError(check.error);
      setEditingName(true);
      return;
    }
    setNameError(null);
    setError(null);

    startSaving(async () => {
      const result = await saveSeance({
        dayId,
        name: check.name,
        exercises,
      });
      if (!result.success) {
        setError(result.error);
        return;
      }
      setDirty(false);
      router.push(backHref);
      router.refresh();
    });
  }

  const canSave = exercises.length > 0 && !isSaving;

  return (
    <main className="min-h-screen pb-4 pt-[max(1rem,env(safe-area-inset-top))]">
      <div className="mx-auto max-w-lg px-4">
        {/* ----- Barre du haut ----- */}
        <div className="relative flex items-center">
          <button
            type="button"
            onClick={requestLeave}
            aria-label="Fermer sans enregistrer"
            className="flex h-11 w-11 items-center justify-center rounded-xl border border-line bg-surface2 text-lg text-fg"
          >
            ✕
          </button>
          <span className="pointer-events-none absolute inset-x-12 text-center text-[11px] font-extrabold uppercase tracking-[0.12em] text-fg-muted">
            {mode === "edit" ? "Modifier la séance" : "Nouvelle séance"}
          </span>
        </div>

        {/* Confirmation d'abandon : `window.confirm` est supprimé en PWA iOS
            standalone, il faut une UI à nous. */}
        {confirmLeave && (
          <div
            role="alertdialog"
            aria-label="Abandonner les modifications ?"
            className="mt-3 rounded-xl border border-line bg-surface p-3"
          >
            <p className="text-sm font-semibold text-fg">
              Abandonner les modifications ?
            </p>
            <p className="mt-0.5 text-xs text-fg-muted">
              Cette séance n&apos;a pas été enregistrée.
            </p>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={() => setConfirmLeave(false)}
                className="flex-1 rounded-lg bg-surface2 py-2 text-sm font-semibold text-fg"
              >
                Non, continuer
              </button>
              <button
                type="button"
                onClick={() => router.push(backHref)}
                className="flex-1 rounded-lg bg-flame py-2 text-sm font-extrabold text-ink"
              >
                Oui, abandonner
              </button>
            </div>
          </div>
        )}

        {/* ----- Nom ----- */}
        <div className="mt-4">
          {editingName ? (
            <input
              ref={nameInputRef}
              defaultValue={displayName}
              maxLength={SEANCE_NAME_MAX_LENGTH}
              placeholder="Nom de la séance"
              aria-label="Nom de la séance"
              onBlur={(e) => commitName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  commitName(e.currentTarget.value);
                } else if (e.key === "Escape") {
                  e.preventDefault();
                  setEditingName(false);
                }
              }}
              className="h-[52px] w-full rounded-xl border border-energy bg-surface2 px-4 text-[22px] font-black text-fg placeholder-fg-faint outline-none"
            />
          ) : (
            <button
              type="button"
              onClick={() => setEditingName(true)}
              aria-label="Modifier le nom de la séance"
              className="flex h-[52px] w-full items-center rounded-xl border border-line bg-surface2 px-4 text-left text-[22px] font-black text-fg"
            >
              <span
                className={`truncate ${displayName ? "" : "text-fg-faint"}`}
              >
                {displayName || "Nom de la séance"}
              </span>
            </button>
          )}

          {nameError ? (
            <p role="alert" className="mt-1.5 text-xs font-semibold text-red-300">
              {nameError}
            </p>
          ) : !nameTouched ? (
            <p className="mt-1.5 text-xs text-fg-muted">
              {showingSuggestion
                ? "Nom proposé d'après tes exercices, modifie-le si tu veux."
                : "Facultatif : un nom sera proposé d'après tes exercices."}
            </p>
          ) : null}
        </div>

        {/* ----- En-tête de liste ----- */}
        <div className="mt-6 flex items-baseline justify-between gap-3">
          <h2 className="text-[11px] font-extrabold uppercase tracking-[0.12em] text-fg-muted">
            Exercices
          </h2>
          {exercises.length > 0 && (
            <span className="font-oswald text-[13px] font-bold text-energy">
              {exercises.length} exercice{exercises.length > 1 ? "s" : ""} ·{" "}
              {setCount} série{setCount > 1 ? "s" : ""}
            </span>
          )}
        </div>

        {/* ----- Liste ou état vide ----- */}
        {exercises.length === 0 ? (
          <div className="mt-4">
            <p className="text-center text-sm text-fg-muted">
              Choisis les exercices de cette séance. Séries, répétitions et
              repos se règlent ensuite sur chaque ligne.
            </p>
            <button
              type="button"
              onClick={() => setSheetOpen(true)}
              className="mt-5 w-full rounded-2xl bg-energy py-4 text-[17px] font-extrabold text-ink"
            >
              + Ajouter un exercice
            </button>
          </div>
        ) : (
          <>
            <ul className="mt-3 flex flex-col gap-2">
              {exercises.map((ex, index) => (
                <li key={ex.exerciseId}>
                  <ExerciseRow
                    exercise={ex}
                    isFirst={index === 0}
                    isLast={index === exercises.length - 1}
                    expandedField={
                      expanded?.exerciseId === ex.exerciseId
                        ? expanded.field
                        : null
                    }
                    directTarget={
                      expanded?.exerciseId === ex.exerciseId
                        ? directTarget
                        : null
                    }
                    cardRef={(node) => {
                      cardRefs.current.set(ex.exerciseId, node);
                    }}
                    onToggleField={(field) => toggleExpanded(ex.exerciseId, field)}
                    onDirectTarget={setDirectTarget}
                    onMoveUp={() => moveExercise(index, -1)}
                    onMoveDown={() => moveExercise(index, 1)}
                    onRemove={() => removeExercise(ex.exerciseId)}
                    onSets={(v) => setSets(ex, v)}
                    onRepsMin={(v) => setRepsMin(ex, v)}
                    onRepsMax={(v) => setRepsMax(ex, v)}
                    onRest={(v) => setRest(ex, v)}
                  />
                </li>
              ))}
            </ul>

            <button
              type="button"
              onClick={() => setSheetOpen(true)}
              className="mt-3 w-full rounded-xl border border-dashed border-line py-3 text-sm font-semibold text-fg-muted active:bg-white/5"
            >
              + Ajouter un exercice
            </button>
          </>
        )}
      </div>

      {/* ----- Barre d'action collante ----- */}
      <div className="sticky bottom-0 mt-6 bg-ink/90 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur">
        <div className="mx-auto max-w-lg px-4">
          {error && (
            <p
              role="alert"
              className="mb-2 rounded-xl border border-red-500/30 bg-red-950/40 px-3 py-2 text-sm text-red-300"
            >
              {error}
            </p>
          )}
          <button
            type="button"
            onClick={save}
            disabled={!canSave}
            className={`w-full rounded-2xl bg-energy py-4 text-[17px] font-extrabold text-ink ${
              canSave ? "" : "opacity-35"
            }`}
          >
            {isSaving ? "Enregistrement…" : "Enregistrer la séance ✓"}
          </button>
        </div>
      </div>

      <AddExerciseSheet
        open={sheetOpen}
        catalog={catalogState}
        usedExerciseIds={usedExerciseIds}
        canCreateExercise={canCreateExercise}
        onSelect={addExercise}
        onCreated={(exercise) => {
          setCatalogState((prev) => [...prev, exercise]);
          addExercise(exercise);
        }}
        onClose={() => setSheetOpen(false)}
      />
    </main>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Une ligne d'exercice : ordre, retrait, et les trois pastilles de réglage.
// ─────────────────────────────────────────────────────────────────────────────

function ExerciseRow({
  exercise,
  isFirst,
  isLast,
  expandedField,
  directTarget,
  cardRef,
  onToggleField,
  onDirectTarget,
  onMoveUp,
  onMoveDown,
  onRemove,
  onSets,
  onRepsMin,
  onRepsMax,
  onRest,
}: {
  exercise: SeanceDraftExercise;
  isFirst: boolean;
  isLast: boolean;
  expandedField: DraftField | null;
  directTarget: DirectTarget | null;
  cardRef: (node: HTMLDivElement | null) => void;
  onToggleField: (field: DraftField) => void;
  onDirectTarget: (target: DirectTarget | null) => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onRemove: () => void;
  onSets: (value: number) => void;
  onRepsMin: (value: number) => void;
  onRepsMax: (value: number) => void;
  onRest: (value: number) => void;
}) {
  const { sets: SETS, reps: REPS, rest: REST } = SEANCE_DRAFT_LIMITS;
  const groupLabel =
    MUSCLE_GROUP_LABELS[exercise.muscleGroup] ?? exercise.muscleGroup;

  return (
    <div
      ref={cardRef}
      className="rounded-2xl border border-line bg-surface p-3"
    >
      <div className="flex items-start gap-2">
        <div className="flex flex-none flex-col">
          <button
            type="button"
            onClick={onMoveUp}
            disabled={isFirst}
            aria-label={`Monter ${exercise.name}`}
            className="flex h-11 w-11 items-center justify-center rounded-lg text-sm font-bold text-fg disabled:opacity-30"
          >
            ↑
          </button>
          <button
            type="button"
            onClick={onMoveDown}
            disabled={isLast}
            aria-label={`Descendre ${exercise.name}`}
            className="flex h-11 w-11 items-center justify-center rounded-lg text-sm font-bold text-fg disabled:opacity-30"
          >
            ↓
          </button>
        </div>

        <div className="min-w-0 flex-1 pt-2">
          <p className="truncate text-base font-extrabold text-fg">
            {exercise.name}
          </p>
          <p className="text-xs font-semibold text-fg-muted">{groupLabel}</p>
        </div>

        <button
          type="button"
          onClick={onRemove}
          aria-label={`Retirer ${exercise.name}`}
          className="flex h-11 w-11 flex-none items-center justify-center rounded-lg text-lg text-fg-muted active:bg-white/5"
        >
          ✕
        </button>
      </div>

      {/* Trois pastilles : un tap déplie le réglage correspondant. */}
      <div className="mt-2 flex gap-2">
        <Pill
          active={expandedField === "sets"}
          value={String(exercise.targetSets)}
          unit={exercise.targetSets > 1 ? "séries" : "série"}
          onClick={() => onToggleField("sets")}
        />
        <Pill
          active={expandedField === "reps"}
          value={`${exercise.targetRepsMin}–${exercise.targetRepsMax}`}
          unit="reps"
          onClick={() => onToggleField("reps")}
        />
        <Pill
          active={expandedField === "rest"}
          value={String(exercise.restSeconds)}
          unit="s repos"
          onClick={() => onToggleField("rest")}
        />
      </div>

      {expandedField === "sets" && (
        <Stepper
          label="Séries"
          value={exercise.targetSets}
          step={SETS.step}
          bounds={SETS}
          editing={directTarget === "sets"}
          onEdit={() => onDirectTarget("sets")}
          onEditEnd={() => onDirectTarget(null)}
          onChange={onSets}
          minusLabel={`Moins une série pour ${exercise.name}`}
          plusLabel={`Plus une série pour ${exercise.name}`}
        />
      )}

      {expandedField === "reps" && (
        <div className="mt-2 flex flex-col gap-2">
          <Stepper
            label="Reps min"
            value={exercise.targetRepsMin}
            step={REPS.step}
            bounds={REPS}
            editing={directTarget === "repsMin"}
            onEdit={() => onDirectTarget("repsMin")}
            onEditEnd={() => onDirectTarget(null)}
            onChange={onRepsMin}
            minusLabel={`Moins une répétition minimum pour ${exercise.name}`}
            plusLabel={`Plus une répétition minimum pour ${exercise.name}`}
          />
          <Stepper
            label="Reps max"
            value={exercise.targetRepsMax}
            step={REPS.step}
            bounds={REPS}
            editing={directTarget === "repsMax"}
            onEdit={() => onDirectTarget("repsMax")}
            onEditEnd={() => onDirectTarget(null)}
            onChange={onRepsMax}
            minusLabel={`Moins une répétition maximum pour ${exercise.name}`}
            plusLabel={`Plus une répétition maximum pour ${exercise.name}`}
          />
        </div>
      )}

      {expandedField === "rest" && (
        <Stepper
          label="Repos (s)"
          value={exercise.restSeconds}
          step={REST.step}
          bounds={REST}
          editing={directTarget === "rest"}
          onEdit={() => onDirectTarget("rest")}
          onEditEnd={() => onDirectTarget(null)}
          onChange={onRest}
          minusLabel={`Moins ${REST.step} secondes de repos pour ${exercise.name}`}
          plusLabel={`Plus ${REST.step} secondes de repos pour ${exercise.name}`}
        />
      )}
    </div>
  );
}

/** Pastille de résumé d'un réglage. Verte quand son réglage est déplié. */
function Pill({
  active,
  value,
  unit,
  onClick,
}: {
  active: boolean;
  value: string;
  unit: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={active}
      className={`flex h-10 flex-1 items-baseline justify-center gap-1 rounded-[10px] border bg-surface2 ${
        active ? "border-energy text-energy" : "border-line text-fg"
      }`}
    >
      <span className="font-oswald text-base font-semibold">{value}</span>
      <span
        className={`text-[11px] ${active ? "text-energy" : "text-fg-muted"}`}
      >
        {unit}
      </span>
    </button>
  );
}

/**
 * Réglage déplié : − / + de 44 × 44 et la valeur au centre, tapable pour la
 * saisir au clavier (même pattern que `DirectInput` de `SessionLogger`, copié
 * plutôt qu'importé : il est privé à cet écran-là).
 */
function Stepper({
  label,
  value,
  step,
  bounds,
  editing,
  onEdit,
  onEditEnd,
  onChange,
  minusLabel,
  plusLabel,
}: {
  label: string;
  value: number;
  step: number;
  bounds: { min: number; max: number };
  editing: boolean;
  onEdit: () => void;
  onEditEnd: () => void;
  onChange: (value: number) => void;
  minusLabel: string;
  plusLabel: string;
}) {
  return (
    <div className="mt-2 flex items-center gap-3 rounded-xl border border-energy/35 bg-ink px-3 py-2">
      <span className="flex-1 text-xs font-extrabold uppercase tracking-wide text-fg-muted">
        {label}
      </span>
      <button
        type="button"
        onClick={() => onChange(value - step)}
        disabled={value <= bounds.min}
        aria-label={minusLabel}
        className="flex h-11 w-11 flex-none items-center justify-center rounded-xl border border-line bg-surface2 text-2xl text-fg disabled:opacity-30"
      >
        −
      </button>
      {editing ? (
        <DirectValueInput
          initial={value}
          label={label}
          onCommit={(raw) => {
            const parsed = Number.parseInt(raw, 10);
            if (Number.isFinite(parsed)) onChange(parsed);
            onEditEnd();
          }}
          onCancel={onEditEnd}
        />
      ) : (
        <button
          type="button"
          onClick={onEdit}
          aria-label={`Saisir ${label.toLowerCase()}`}
          className="min-h-11 w-16 flex-none text-center font-oswald text-[22px] font-bold text-fg"
        >
          {value}
        </button>
      )}
      <button
        type="button"
        onClick={() => onChange(value + step)}
        disabled={value >= bounds.max}
        aria-label={plusLabel}
        className="flex h-11 w-11 flex-none items-center justify-center rounded-xl bg-energy text-2xl font-bold text-ink disabled:opacity-30"
      >
        +
      </button>
    </div>
  );
}

/** Saisie clavier d'un entier : valide au blur ou sur Entrée, annule sur Échap. */
function DirectValueInput({
  initial,
  label,
  onCommit,
  onCancel,
}: {
  initial: number;
  label: string;
  onCommit: (raw: string) => void;
  onCancel: () => void;
}) {
  const [val, setVal] = useState(String(initial));
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);

  return (
    <input
      ref={ref}
      value={val}
      onChange={(e) => setVal(e.target.value)}
      onBlur={() => onCommit(val)}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          onCommit(val);
        } else if (e.key === "Escape") {
          e.preventDefault();
          onCancel();
        }
      }}
      inputMode="numeric"
      aria-label={`Saisir ${label.toLowerCase()}`}
      className="h-11 w-16 flex-none rounded-xl border border-energy bg-ink text-center font-oswald text-[22px] font-bold text-fg outline-none"
    />
  );
}
