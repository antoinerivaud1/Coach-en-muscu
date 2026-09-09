"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { finishSession, type LoggedSet } from "./actions";
import type { LastExerciseData } from "@/lib/queries/sessions";
import {
  formatWeight,
  formatDateShort,
  formatClock,
} from "@/lib/utils/training";
import { resolvePrefill } from "@/lib/utils/prefill";
import ExerciseInfo from "@/components/ExerciseInfo";
import { addPending } from "@/lib/pendingSessions";
import { useWakeLock } from "@/hooks/useWakeLock";
import { useRestTimer } from "@/hooks/useRestTimer";
import RestTimerBar, {
  REST_BAR_CONTENT_HEIGHT,
  readSafeAreaTop,
} from "@/components/RestTimerBar";
import {
  ensureNotificationPermission,
  scheduleRestNotification,
  cancelRestNotification,
} from "@/lib/restNotifications";

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
  const [validated, setValidated] = useState<Record<string, number>>(() => {
    const out: Record<string, number> = {};
    for (const ex of exercises) {
      const rows = initialSets[ex.exercise_id] ?? [];
      out[ex.exercise_id] = editing ? rows.length : 0;
    }
    return out;
  });

  const [currentIdx, setCurrentIdx] = useState(0);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [offlineSaved, setOfflineSaved] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  // Champ en cours d'édition au clavier (CM-63) sur la série active.
  const [editingField, setEditingField] = useState<"weight" | "reps" | null>(
    null,
  );

  useWakeLock(!offlineSaved);

  useEffect(() => {
    ensureNotificationPermission();
  }, []);

  useEffect(() => {
    const t = setInterval(
      () => setElapsed(Math.round((Date.now() - startedAt.current) / 1000)),
      1000,
    );
    return () => clearInterval(t);
  }, []);

  // ----- Minuteur de repos (CM-73) -----
  // Instance unique : l'anneau (état grand) et la barre épinglée (état
  // compact) lisent le même décompte.
  const rest = useRestTimer();
  const restCardRef = useRef<HTMLDivElement | null>(null);
  const [isPinned, setIsPinned] = useState(false);
  const restState = rest.state;
  const stopRest = rest.stop;

  useEffect(() => {
    if (restState !== "finished") return;
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      navigator.vibrate?.(400);
    }
    stopRest();
  }, [restState, stopRest]);

  // Bascule grand -> compact. IntersectionObserver et non listener scroll :
  // le scroll est trop coûteux sur iOS. Le rootMargin haut remonte la
  // frontière sous la barre épinglée (encoche comprise), pour que la carte
  // soit considérée sortie pile quand elle passe dessous.
  useEffect(() => {
    if (restState !== "running") {
      setIsPinned(false);
      return;
    }
    const el = restCardRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;

    const topInset = readSafeAreaTop() + REST_BAR_CONTENT_HEIGHT;
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry) return;
        // Sortie par le bas (carte encore sous le viewport) : pas d'épinglage.
        setIsPinned(
          !entry.isIntersecting && entry.boundingClientRect.top < topInset,
        );
      },
      { threshold: 0, rootMargin: `-${topInset}px 0px 0px 0px` },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [restState]);

  function startRest(seconds: number) {
    const s = seconds > 0 ? seconds : 90;
    rest.start(s);
    void scheduleRestNotification(s, `/sessions/${sessionId}`);
  }

  function skipRest() {
    rest.stop();
    void cancelRestNotification();
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
      // La saisie directe peut contenir une virgule (22,5) : on normalise.
      const raw = Number(String(current[field]).replace(",", "."));
      const base = Number.isFinite(raw) ? raw : 0;
      const next = Math.max(0, base + delta);
      const value =
        field === "weight" ? formatWeight(next) : String(Math.round(next));
      rows[rowIndex] = { ...current, [field]: value, touched: true };
      return { ...prev, [exId]: rows };
    });
  }

  // Saisie directe au clavier (CM-63) : tap sur la valeur -> pavé numérique.
  function commitDirect(
    exId: string,
    rowIndex: number,
    field: "weight" | "reps",
    raw: string,
  ) {
    setEditingField(null);
    const trimmed = raw.trim();
    setSets((prev) => {
      const rows = prev[exId] ? [...prev[exId]!] : [];
      const current = rows[rowIndex];
      if (!current) return prev;
      let value: string;
      if (field === "weight") {
        if (trimmed === "") {
          value = "";
        } else {
          const n = Number(trimmed.replace(",", "."));
          if (!Number.isFinite(n) || n < 0) return prev;
          value = formatWeight(n);
        }
      } else {
        if (trimmed === "") return prev; // reps obligatoires : on ne vide pas
        const n = parseInt(trimmed, 10);
        if (!Number.isFinite(n) || n < 0) return prev;
        value = String(n);
      }
      rows[rowIndex] = { ...current, [field]: value, touched: true };
      return { ...prev, [exId]: rows };
    });
  }

  function toggleWarmup(exId: string, rowIndex: number) {
    setSets((prev) => {
      const rows = prev[exId] ? [...prev[exId]!] : [];
      const current = rows[rowIndex];
      if (!current) return prev;
      rows[rowIndex] = { ...current, isWarmup: !current.isWarmup, touched: true };
      return { ...prev, [exId]: rows };
    });
  }

  function addRow(exId: string) {
    setSets((prev) => {
      const rows = prev[exId] ? [...prev[exId]!] : [];
      // CM-68 : une série ajoutée manuellement hérite de la dernière série
      // effective (hors échauffement) de l'exercice, sans être marquée touched.
      let previousEffectiveSet: { weight: string; reps: string } | null = null;
      for (let i = rows.length - 1; i >= 0; i -= 1) {
        const r = rows[i]!;
        if (!r.isWarmup && (r.weight !== "" || r.reps !== "")) {
          previousEffectiveSet = { weight: r.weight, reps: r.reps };
          break;
        }
      }
      const resolved = resolvePrefill({
        touched: false,
        current: { weight: "", reps: "" },
        previousEffectiveSet,
        isFirstSet: rows.length === 0,
        firstSetSuggestion: null,
      });
      rows.push({
        weight: resolved.weight,
        reps: resolved.reps,
        isWarmup: false,
        touched: false,
      });
      return { ...prev, [exId]: rows };
    });
  }

  function validateSet(exId: string, activeIndex: number, restSeconds: number) {
    const rows = sets[exId] ?? [];
    const row = rows[activeIndex];
    if (!row) return;
    const reps = parseInt(row.reps, 10);
    if (!(reps > 0)) {
      setError("Renseigne les répétitions avant de valider la série.");
      return;
    }
    setError(null);
    setEditingField(null);
    setSets((prev) => {
      const r = prev[exId] ? [...prev[exId]!] : [];
      const validatedRow = r[activeIndex];
      if (!validatedRow) return prev;
      r[activeIndex] = { ...validatedRow, touched: true };
      // CM-68 : propagation vers la série suivante non touchée. Un échauffement
      // ne sert jamais de source de propagation vers une série effective.
      const nextIndex = activeIndex + 1;
      const next = r[nextIndex];
      if (next && !validatedRow.isWarmup) {
        const resolved = resolvePrefill({
          touched: next.touched,
          current: { weight: next.weight, reps: next.reps },
          previousEffectiveSet: {
            weight: validatedRow.weight,
            reps: validatedRow.reps,
          },
          isFirstSet: nextIndex === 0,
          firstSetSuggestion: null,
        });
        // On ne marque JAMAIS la série cible comme touched : une série
        // pré-remplie mais non validée ne doit pas être enregistrée (CM-68).
        r[nextIndex] = {
          ...next,
          weight: resolved.weight,
          reps: resolved.reps,
        };
      }
      return { ...prev, [exId]: r };
    });
    setValidated((v) => ({ ...v, [exId]: (v[exId] ?? 0) + 1 }));
    startRest(restSeconds);
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
        addPending(input);
        setOfflineSaved(true);
      }
    });
  }

  const ex = exercises[currentIdx]!;
  const rows = sets[ex.exercise_id] ?? [];
  const vcount = validated[ex.exercise_id] ?? 0;
  const activeIndex = vcount;
  const activeRow = rows[activeIndex];
  const exerciseDone = rows.length > 0 && vcount >= rows.length;
  const isLast = currentIdx === exercises.length - 1;
  const last = ex.last;

  // Delta CM-64 : comparaison alignée sur l'index de série (série i vs série i
  // de la dernière fois), affichée quand la saisie en cours diffère.
  const lastForActive = last?.sets[activeIndex];
  const currentWeightNum =
    activeRow && activeRow.weight !== ""
      ? Number(activeRow.weight.replace(",", "."))
      : NaN;
  const rawDelta =
    lastForActive && Number.isFinite(currentWeightNum)
      ? Math.round((currentWeightNum - lastForActive.weight_kg) * 100) / 100
      : null;
  const deltaKg = rawDelta !== null && Math.abs(rawDelta) >= 0.01 ? rawDelta : null;

  // On sort du mode saisie clavier dès qu'on change d'exercice ou de série.
  useEffect(() => {
    setEditingField(null);
  }, [currentIdx, activeIndex]);

  const C = 2 * Math.PI * 70;
  const restFrac =
    rest.totalSeconds > 0
      ? Math.max(0, Math.min(1, rest.remainingSeconds / rest.totalSeconds))
      : 0;

  if (offlineSaved) {
    return (
      <div className="mx-auto flex min-h-[100dvh] max-w-lg flex-col items-center justify-center px-6 text-center">
        <p className="rounded-2xl border border-flame/30 bg-flame/10 px-4 py-3 text-sm text-flame">
          Séance enregistrée hors-ligne. Elle se synchronisera dès que tu auras
          du réseau.
        </p>
        <button
          type="button"
          onClick={() => router.push("/dashboard")}
          className="mt-4 w-full rounded-xl bg-energy py-3 font-extrabold text-ink"
        >
          Retour à l&apos;accueil
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-[100dvh] max-w-lg flex-col px-5 pb-6 pt-[max(0.5rem,env(safe-area-inset-top))]">
      {/* Top bar */}
      <div className="flex items-center justify-between gap-2 py-2">
        <button
          type="button"
          onClick={() => router.push("/dashboard")}
          className="flex h-9 w-9 items-center justify-center rounded-xl border border-line bg-surface2 text-fg"
          aria-label="Quitter la séance"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="h-[18px] w-[18px]">
            <path d="M18 6 6 18" />
            <path d="m6 6 12 12" />
          </svg>
        </button>
        <div className="text-center">
          <div className="flex items-center justify-center gap-1.5">
            <span className="h-2 w-2 animate-pulse rounded-full bg-elle" />
            <span className="font-oswald text-lg font-bold tracking-wide text-fg">
              {formatClock(elapsed)}
            </span>
          </div>
          <div className="text-[11px] font-semibold text-fg-muted">{dayName}</div>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setCurrentIdx((i) => Math.max(0, i - 1))}
            disabled={currentIdx === 0}
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-line bg-surface2 text-fg disabled:opacity-30"
            aria-label="Exercice précédent"
          >
            ‹
          </button>
          <span className="font-oswald text-[13px] font-bold text-energy">
            {currentIdx + 1}/{exercises.length}
          </span>
          <button
            type="button"
            onClick={() => setCurrentIdx((i) => Math.min(exercises.length - 1, i + 1))}
            disabled={isLast}
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-line bg-surface2 text-fg disabled:opacity-30"
            aria-label="Exercice suivant"
          >
            ›
          </button>
        </div>
      </div>

      {/* État compact : barre épinglée tant que la carte est hors écran. */}
      {isPinned && rest.state === "running" && (
        <RestTimerBar
          remainingSeconds={rest.remainingSeconds}
          totalSeconds={rest.totalSeconds}
          onAddSeconds={rest.addSeconds}
          onSkip={skipRest}
        >
          {/* CM-67 : la barre de progression de séance se glissera ici,
              sous le timer (ordre produit imposé). */}
        </RestTimerBar>
      )}

      {/* État grand : anneau de repos, à sa place naturelle dans le flux. */}
      {rest.state === "running" && (
        <div ref={restCardRef} className="mt-2 flex flex-col items-center gap-3">
          <div className="relative h-[150px] w-[150px]">
            <svg viewBox="0 0 160 160" className="h-full w-full -rotate-90">
              <circle cx="80" cy="80" r="70" fill="none" stroke="#1c1c24" strokeWidth="11" />
              <circle
                cx="80"
                cy="80"
                r="70"
                fill="none"
                stroke="var(--energy)"
                strokeWidth="11"
                strokeLinecap="round"
                strokeDasharray={C}
                strokeDashoffset={C * (1 - restFrac)}
                style={{ transition: "stroke-dashoffset 1s linear" }}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-fg-muted">
                Repos
              </span>
              <span className="font-oswald text-4xl font-bold tabular-nums text-fg">
                {formatClock(rest.remainingSeconds)}
              </span>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => rest.addSeconds(-15)}
              className="rounded-xl border border-line bg-surface2 px-4 py-2 font-oswald text-sm font-semibold text-fg active:bg-white/10"
            >
              − 15 s
            </button>
            <button
              type="button"
              onClick={skipRest}
              className="rounded-xl border border-line bg-surface2 px-4 py-2 font-oswald text-sm font-semibold text-fg active:bg-white/10"
            >
              Passer
            </button>
            <button
              type="button"
              onClick={() => rest.addSeconds(15)}
              className="rounded-xl border border-line bg-surface2 px-4 py-2 font-oswald text-sm font-semibold text-fg active:bg-white/10"
            >
              + 15 s
            </button>
          </div>
        </div>
      )}

      {/* Carte exercice courant */}
      <div className="mt-4 flex-1">
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-wide text-toi">
              Exercice {currentIdx + 1}
            </div>
            <h1 className="mt-0.5 text-2xl font-black tracking-tight text-fg">
              {ex.name}
            </h1>
          </div>
          <ExerciseInfo name={ex.name} muscleGroup={ex.muscle_group} />
        </div>
        <p className="mt-1 text-xs text-fg-muted">
          Objectif {ex.target_sets} × {ex.target_reps_min}–{ex.target_reps_max}
        </p>

        {/* Rappel « dernière fois » (CM-64) — lecture seule, distinct d'un champ. */}
        {last && last.sets.length > 0 ? (
          <div className="mt-3 rounded-xl bg-surface/50 px-3.5 py-2.5">
            <div className="font-oswald text-[11px] font-bold uppercase tracking-[0.14em] text-fg-muted">
              Dernière fois, {formatDateShort(last.performed_at)}
            </div>
            <div className="mt-0.5 font-oswald text-sm text-fg">
              {last.sets
                .map((s) => `${formatWeight(s.weight_kg)} kg × ${s.reps}`)
                .join(", ")}
            </div>
          </div>
        ) : (
          <div className="mt-3 rounded-xl bg-surface/50 px-3.5 py-2.5 text-sm text-fg-muted">
            Première fois sur cet exercice
          </div>
        )}

        {/* Liste des séries */}
        <div className="mt-3 flex flex-col gap-2">
          {rows.map((row, i) => {
            const done = i < vcount;
            const active = i === activeIndex;
            return (
              <div
                key={i}
                className={`flex items-center gap-3 rounded-xl px-3.5 py-2.5 ${
                  active
                    ? "border-[1.5px] border-energy bg-energy/[0.08]"
                    : done
                      ? "bg-surface"
                      : "opacity-50"
                }`}
              >
                <span
                  className={`flex h-6 w-6 flex-none items-center justify-center rounded-full font-oswald text-xs font-bold ${
                    done
                      ? "bg-energy text-ink"
                      : active
                        ? "border-2 border-energy text-energy"
                        : "border border-fg-faint text-fg-muted"
                  }`}
                >
                  {done ? "✓" : i + 1}
                </span>
                <span
                  className={`flex-1 text-[13px] font-bold ${
                    active ? "text-energy" : "text-fg-muted"
                  }`}
                >
                  {row.isWarmup ? "Échauffement" : done ? `Série ${i + 1}` : active ? "En cours" : "À venir"}
                </span>
                <span className="font-oswald text-base text-fg">
                  {done || (active && row.weight !== "")
                    ? `${row.weight || 0} kg `
                    : "— kg "}
                  <span className="text-fg-muted">×</span>{" "}
                  {done || (active && row.reps !== "") ? row.reps || 0 : "—"}
                </span>
              </div>
            );
          })}
        </div>

        {/* Saisie de la série en cours (CM-63) */}
        {!exerciseDone && activeRow && (
          <div className="mt-4 flex flex-col gap-3">
            {/* Poids : pas de base 1 kg + pas rapide 2,5 kg + saisie clavier */}
            <div className="rounded-2xl border border-line bg-surface px-4 py-3.5">
              <div className="flex items-center justify-between">
                <div className="text-[11px] font-extrabold uppercase tracking-wide text-fg-muted">
                  Poids
                </div>
                {deltaKg !== null && (
                  <span
                    className={`font-oswald text-xs font-bold ${
                      deltaKg >= 0 ? "text-energy" : "text-flame"
                    }`}
                  >
                    {deltaKg > 0 ? "+" : "−"}
                    {formatWeight(Math.abs(deltaKg))} kg
                    <span className="ml-1 font-normal text-fg-faint">
                      vs dernière
                    </span>
                  </span>
                )}
              </div>
              <div className="mt-0.5 flex items-baseline gap-1.5">
                {editingField === "weight" ? (
                  <DirectInput
                    field="weight"
                    initial={activeRow.weight}
                    onCommit={(raw) =>
                      commitDirect(ex.exercise_id, activeIndex, "weight", raw)
                    }
                    onCancel={() => setEditingField(null)}
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => setEditingField("weight")}
                    className="min-h-11 font-oswald text-[34px] font-bold leading-none text-fg"
                    aria-label="Modifier le poids au clavier"
                  >
                    {activeRow.weight || 0}
                  </button>
                )}
                <span className="text-sm font-bold text-fg-muted">kg</span>
              </div>
              <div className="mt-3 grid grid-cols-4 gap-2">
                <button
                  type="button"
                  onClick={() => step(ex.exercise_id, activeIndex, "weight", -2.5)}
                  className="flex h-11 items-center justify-center rounded-2xl border border-line bg-surface2 font-oswald text-base font-semibold text-fg active:bg-white/10"
                  aria-label="Moins 2,5 kg"
                >
                  −2.5
                </button>
                <button
                  type="button"
                  onClick={() => step(ex.exercise_id, activeIndex, "weight", -1)}
                  className="flex h-11 items-center justify-center rounded-2xl border border-line bg-surface2 text-2xl text-fg active:bg-white/10"
                  aria-label="Moins 1 kg"
                >
                  −
                </button>
                <button
                  type="button"
                  onClick={() => step(ex.exercise_id, activeIndex, "weight", 1)}
                  className="flex h-11 items-center justify-center rounded-2xl bg-energy text-2xl font-bold text-ink"
                  aria-label="Plus 1 kg"
                >
                  +
                </button>
                <button
                  type="button"
                  onClick={() => step(ex.exercise_id, activeIndex, "weight", 2.5)}
                  className="flex h-11 items-center justify-center rounded-2xl bg-energy font-oswald text-base font-bold text-ink"
                  aria-label="Plus 2,5 kg"
                >
                  +2.5
                </button>
              </div>
            </div>

            {/* Répétitions : pas de 1 + saisie clavier (entiers) */}
            <div className="rounded-2xl border border-line bg-surface px-4 py-3.5">
              <div className="text-[11px] font-extrabold uppercase tracking-wide text-fg-muted">
                Répétitions
              </div>
              <div className="mt-0.5 flex items-baseline gap-1.5">
                {editingField === "reps" ? (
                  <DirectInput
                    field="reps"
                    initial={activeRow.reps}
                    onCommit={(raw) =>
                      commitDirect(ex.exercise_id, activeIndex, "reps", raw)
                    }
                    onCancel={() => setEditingField(null)}
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => setEditingField("reps")}
                    className="min-h-11 font-oswald text-[34px] font-bold leading-none text-fg"
                    aria-label="Modifier les répétitions au clavier"
                  >
                    {activeRow.reps || 0}
                  </button>
                )}
                <span className="text-sm font-bold text-fg-muted">reps</span>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => step(ex.exercise_id, activeIndex, "reps", -1)}
                  className="flex h-11 items-center justify-center rounded-2xl border border-line bg-surface2 text-2xl text-fg active:bg-white/10"
                  aria-label="Moins 1 répétition"
                >
                  −
                </button>
                <button
                  type="button"
                  onClick={() => step(ex.exercise_id, activeIndex, "reps", 1)}
                  className="flex h-11 items-center justify-center rounded-2xl bg-energy text-2xl font-bold text-ink"
                  aria-label="Plus 1 répétition"
                >
                  +
                </button>
              </div>
            </div>

            <button
              type="button"
              onClick={() => toggleWarmup(ex.exercise_id, activeIndex)}
              className={`min-h-11 text-left text-[11px] font-semibold ${
                activeRow.isWarmup ? "text-toi" : "text-fg-faint"
              }`}
            >
              {activeRow.isWarmup ? "● Échauffement" : "○ Marquer comme échauffement"}
            </button>
          </div>
        )}

        {exerciseDone && (
          <button
            type="button"
            onClick={() => addRow(ex.exercise_id)}
            className="mt-3 w-full rounded-xl border border-dashed border-line py-2.5 text-xs font-semibold text-fg-muted active:bg-white/5"
          >
            + Ajouter une série
          </button>
        )}

        {/* Ressenti (dernier exercice terminé) */}
        {exerciseDone && isLast && (
          <div className="mt-5">
            <p className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-fg-muted">
              Ressenti de la séance
            </p>
            <div className="mt-2 grid grid-cols-4 gap-2">
              {FEEDBACK_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setFeedback((p) => (p === opt.value ? null : opt.value))}
                  className={`rounded-xl py-2 text-xs font-bold ${
                    feedback === opt.value ? "bg-energy text-ink" : "bg-surface2 text-fg-muted"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {error && (
          <p className="mt-4 rounded-xl border border-red-500/30 bg-red-950/40 px-3 py-2 text-sm text-red-300">
            {error}
          </p>
        )}
      </div>

      {/* Action principale */}
      <div className="sticky bottom-0 -mx-5 mt-4 bg-ink/90 px-5 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur">
        {!exerciseDone ? (
          <button
            type="button"
            onClick={() =>
              activeRow
                ? validateSet(ex.exercise_id, activeIndex, ex.rest_seconds)
                : addRow(ex.exercise_id)
            }
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-energy py-4 text-[17px] font-extrabold text-ink"
          >
            {activeRow ? "Valider la série" : "Ajouter une série"}
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
              <path d="M20 6 9 17l-5-5" />
            </svg>
          </button>
        ) : isLast ? (
          <button
            type="button"
            onClick={handleFinish}
            disabled={isPending}
            className="w-full rounded-2xl bg-energy py-4 text-[17px] font-extrabold text-ink disabled:opacity-50"
          >
            {isPending ? "Enregistrement…" : "Terminer la séance"}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setCurrentIdx((i) => Math.min(exercises.length - 1, i + 1))}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-energy py-4 text-[17px] font-extrabold text-ink"
          >
            Exercice suivant
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
              <path d="m9 18 6-6-6-6" />
            </svg>
          </button>
        )}
        {!(exerciseDone && isLast) && (
          <button
            type="button"
            onClick={handleFinish}
            disabled={isPending}
            className="mt-2 w-full py-1 text-center text-xs font-semibold text-fg-muted hover:text-fg disabled:opacity-50"
          >
            Terminer maintenant
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * Saisie directe au clavier d'une valeur poids/reps (CM-63). Ouvre un pavé
 * numérique adapté ; accepte la virgule et le point pour les décimales du
 * poids. Valide au blur ou sur Entrée, annule sur Échap.
 */
function DirectInput({
  field,
  initial,
  onCommit,
  onCancel,
}: {
  field: "weight" | "reps";
  initial: string;
  onCommit: (raw: string) => void;
  onCancel: () => void;
}) {
  const [val, setVal] = useState(initial);
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
      inputMode={field === "weight" ? "decimal" : "numeric"}
      className="h-11 w-28 rounded-xl border border-energy bg-ink px-2 font-oswald text-[34px] font-bold leading-none text-fg outline-none"
      aria-label={field === "weight" ? "Saisir le poids" : "Saisir les répétitions"}
    />
  );
}
