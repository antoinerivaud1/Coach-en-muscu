"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  finishSession,
  fetchLastForExercise,
  type FinishSessionInput,
} from "./actions";
import type { LastExerciseData } from "@/lib/queries/sessions";
import type { SystemExercise } from "@/lib/queries/exercises";
import {
  formatWeight,
  formatDateShort,
  formatClock,
} from "@/lib/utils/training";
import { resolvePrefill, suggestFirstSet } from "@/lib/utils/prefill";
import {
  EXTRA_EXERCISE_DEFAULTS,
  resumeExerciseIndex,
  type SessionExercise,
} from "@/lib/utils/sessionExercises";
import { newSetId, type PendingSet } from "@/lib/utils/setQueue";
import { useSetPersistence } from "@/hooks/useSetPersistence";
import ExerciseInfo from "@/components/ExerciseInfo";
import AddExerciseSheet from "@/components/AddExerciseSheet";
import { addPending } from "@/lib/pendingSessions";
import { useWakeLock } from "@/hooks/useWakeLock";
import { useRestTimer } from "@/hooks/useRestTimer";
import RestTimerBar, { readSafeAreaTop } from "@/components/RestTimerBar";
import SessionProgressBar, {
  SESSION_PROGRESS_BAR_HEIGHT,
} from "@/components/SessionProgressBar";
import { computeSessionProgress } from "@/lib/utils/progress";
import { ensureNotificationPermission } from "@/lib/restNotifications";

type Feedback = "easy" | "normal" | "hard" | "failure";

/**
 * Un exercice de la séance, du programme ou ajouté en cours de route (CM-62) :
 * forme unique (`SessionExercise`), plus l'historique « dernière fois ».
 */
export type LoggerExercise = SessionExercise & {
  last: LastExerciseData | null;
};

/**
 * Série transmise par le serveur. `id` non nul = série déjà en base (séance en
 * cours reprise, ou séance terminée rouverte en modification) ; `id` nul =
 * ligne vide ou pré-remplie, qui n'existera en base qu'à sa validation.
 */
export type InitialSet = {
  id: string | null;
  setIndex: number | null;
  weight: string;
  reps: string;
  isWarmup: boolean;
};

type SetField = InitialSet & { touched: boolean };

type Props = {
  sessionId: string;
  dayName: string;
  exercises: LoggerExercise[];
  initialSets: Record<string, InitialSet[]>;
  /** Catalogue d'ajout en séance : exercices système + persos du couple. */
  catalog: SystemExercise[];
  canCreateExercise: boolean;
};

const FEEDBACK_OPTIONS: { value: Feedback; label: string }[] = [
  { value: "easy", label: "Facile" },
  { value: "normal", label: "Normal" },
  { value: "hard", label: "Dur" },
  { value: "failure", label: "Échec" },
];

/** Séries déjà en base d'un exercice : les lignes de tête qui portent un id. */
function countPersisted(rows: readonly { id: string | null }[]): number {
  let n = 0;
  while (n < rows.length && rows[n]!.id !== null) n += 1;
  return n;
}

export default function SessionLogger({
  sessionId,
  dayName,
  exercises,
  initialSets,
  catalog,
  canCreateExercise,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const startedAt = useRef<number>(Date.now());

  // CM-78 : toute série validée part en base immédiatement, par cette file.
  const persistence = useSetPersistence(sessionId);
  const { enqueueUpsert, enqueueDelete } = persistence;

  const [sets, setSets] = useState<Record<string, SetField[]>>(() => {
    const out: Record<string, SetField[]> = {};
    for (const ex of exercises) {
      const rows = initialSets[ex.exerciseId] ?? [];
      // Une série déjà en base est forcément « touchée » : elle a été saisie.
      out[ex.exerciseId] = rows.map((r) => ({ ...r, touched: r.id !== null }));
    }
    return out;
  });
  const [validated, setValidated] = useState<Record<string, number>>(() => {
    const out: Record<string, number> = {};
    for (const ex of exercises) {
      out[ex.exerciseId] = countPersisted(initialSets[ex.exerciseId] ?? []);
    }
    return out;
  });

  // ----- Exercices ajoutés en cours de séance (CM-62) -----
  // `exercises` contient déjà le programme puis les exercices hors programme
  // reconstruits depuis les séries en base : les ajouts de la session courante
  // se contentent donc de s'empiler à la suite, l'ordre reste « programme
  // d'abord ». Tant qu'aucune série n'est validée, un ajout ne laisse aucune
  // trace en base et disparaît au rechargement — c'est voulu.
  const [extras, setExtras] = useState<LoggerExercise[]>([]);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [catalogState, setCatalogState] = useState<SystemExercise[]>(catalog);
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null);
  const [isLoadingLast, startLoadLast] = useTransition();
  const cardRef = useRef<HTMLDivElement | null>(null);
  const scrollToCard = useRef(false);

  const allExercises = useMemo(
    () => [...exercises, ...extras],
    [exercises, extras],
  );

  // Reprise d'une séance en cours (CM-78) : on rouvre sur le premier exercice
  // qui n'est pas terminé, pas sur le premier de la liste.
  const [currentIdx, setCurrentIdx] = useState(() => {
    const counts: Record<string, number> = {};
    for (const ex of exercises) {
      counts[ex.exerciseId] = countPersisted(initialSets[ex.exerciseId] ?? []);
    }
    return resumeExerciseIndex(exercises, counts);
  });
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** Série validée dont la suppression attend confirmation : `exId:index`. */
  const [confirmDeleteSet, setConfirmDeleteSet] = useState<string | null>(null);
  /** Confirmation « terminer alors que des séries restent en attente ». */
  const [confirmFinish, setConfirmFinish] = useState(false);
  const [isFlushing, setIsFlushing] = useState(false);
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
  // La notification de fin de repos est planifiée par le hook, sur l'échéance
  // du timer (CM-74) : aucune planification ici.
  const rest = useRestTimer({ notificationUrl: `/sessions/${sessionId}` });
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

    // La barre épinglée mesure la seule progression tant que le timer n'y est
    // pas encore : c'est cette hauteur-là que la carte doit franchir.
    const topInset = readSafeAreaTop() + SESSION_PROGRESS_BAR_HEIGHT;
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

  // ----- Progression de séance (CM-67) -----
  // Dérivée de l'état déjà en place (séries validées par exercice) : aucune
  // requête supplémentaire, aucun état global. Recalculée à chaque validation
  // ou suppression de série.
  // CM-62 : la liste passée ici inclut les exercices ajoutés, donc le total
  // augmente à l'ajout et la barre recule légèrement. Aucun cas particulier.
  const progress = useMemo(
    () =>
      computeSessionProgress(
        allExercises.map((e) => ({
          exerciseId: e.exerciseId,
          plannedSets: e.targetSets,
          loggedSets: validated[e.exerciseId] ?? 0,
        })),
      ),
    [allExercises, validated],
  );

  // ----- Ajout / retrait d'un exercice hors programme (CM-62) -----

  /**
   * Ajoute un exercice du catalogue à la séance : cibles par défaut, séries
   * vides, puis chargement de la « dernière fois » (toutes séances confondues)
   * pour pré-remplir la première série comme n'importe quel autre exercice.
   */
  function addExtraExercise(exercise: SystemExercise) {
    if (allExercises.some((e) => e.exerciseId === exercise.id)) return;

    const added: LoggerExercise = {
      exerciseId: exercise.id,
      name: exercise.name,
      muscleGroup: exercise.muscle_group,
      ...EXTRA_EXERCISE_DEFAULTS,
      source: "extra",
      last: null,
    };

    setExtras((prev) => [...prev, added]);
    setSets((prev) => ({
      ...prev,
      [exercise.id]: Array.from({ length: added.targetSets }, () => ({
        id: null,
        setIndex: null,
        weight: "",
        reps: "",
        isWarmup: false,
        touched: false,
      })),
    }));
    setValidated((prev) => ({ ...prev, [exercise.id]: 0 }));
    setError(null);
    setCurrentIdx(allExercises.length);
    scrollToCard.current = true;

    startLoadLast(async () => {
      const last = await fetchLastForExercise(exercise.id, sessionId);
      if (!last) return;
      setExtras((prev) =>
        prev.map((e) => (e.exerciseId === exercise.id ? { ...e, last } : e)),
      );
      const suggestion = suggestFirstSet(
        last,
        added.targetRepsMin,
        added.targetRepsMax,
      );
      if (!suggestion) return;
      // Seule la série 1 est pré-remplie depuis le passé (CM-68), et jamais
      // sur une valeur déjà saisie.
      setSets((prev) => {
        const rows = prev[exercise.id];
        const first = rows?.[0];
        if (!rows || !first || first.touched) return prev;
        const next = [...rows];
        next[0] = { ...first, weight: suggestion.weight, reps: suggestion.reps };
        return { ...prev, [exercise.id]: next };
      });
    });
  }

  /** Retrait d'un exercice ajouté, possible tant qu'aucune série n'est validée. */
  function removeExtraExercise(exerciseId: string) {
    setConfirmRemoveId(null);
    const index = allExercises.findIndex((e) => e.exerciseId === exerciseId);
    setExtras((prev) => prev.filter((e) => e.exerciseId !== exerciseId));
    setSets((prev) => {
      const next = { ...prev };
      delete next[exerciseId];
      return next;
    });
    setValidated((prev) => {
      const next = { ...prev };
      delete next[exerciseId];
      return next;
    });
    setError(null);
    if (index >= 0) {
      setCurrentIdx((i) => (i >= index ? Math.max(0, i - 1) : i));
    }
  }

  function startRest(seconds: number) {
    rest.start(seconds > 0 ? seconds : 90);
  }

  function skipRest() {
    rest.stop();
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
        id: null,
        setIndex: null,
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
        id: null,
        setIndex: null,
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
    const weight = row.weight === "" ? 0 : Number(row.weight.replace(",", "."));
    if (!Number.isFinite(weight) || weight < 0) {
      setError("Poids invalide.");
      return;
    }
    setError(null);
    setEditingField(null);

    // CM-78 : id généré ici, jamais par la base, pour qu'un réessai rejoue la
    // même ligne. `set_index` est celui de la validation et ne bouge plus : une
    // suppression ne renumérote rien en base, l'affichage se recale seul.
    const id = row.id ?? newSetId();
    const maxSetIndex = rows.reduce(
      (max, r) => Math.max(max, r.setIndex ?? 0),
      0,
    );
    const setIndex = row.setIndex ?? maxSetIndex + 1;

    setSets((prev) => {
      const r = prev[exId] ? [...prev[exId]!] : [];
      const validatedRow = r[activeIndex];
      if (!validatedRow) return prev;
      r[activeIndex] = { ...validatedRow, id, setIndex, touched: true };
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

    // L'écriture part en tâche de fond : ni attente, ni spinner. Le repos
    // démarre exactement comme avant.
    enqueueUpsert({
      id,
      sessionId,
      exerciseId: exId,
      setIndex,
      weightKg: weight,
      reps,
      isWarmup: row.isWarmup,
      rpe: null,
    });
    startRest(restSeconds);
  }

  /**
   * Supprime une série déjà validée : retrait local immédiat, puis suppression
   * en base. Les séries suivantes gardent leur `set_index` en base — seule la
   * numérotation affichée se recale, sur l'ordre des lignes.
   */
  function removeValidatedSet(exId: string, rowIndex: number) {
    setConfirmDeleteSet(null);
    const row = sets[exId]?.[rowIndex];
    if (!row) return;
    setError(null);
    setSets((prev) => {
      const r = prev[exId] ? [...prev[exId]!] : [];
      if (!r[rowIndex]) return prev;
      r.splice(rowIndex, 1);
      return { ...prev, [exId]: r };
    });
    setValidated((v) => ({ ...v, [exId]: Math.max(0, (v[exId] ?? 0) - 1) }));
    if (row.id) enqueueDelete(row.id);
  }

  /** Séries validées, toutes exercices confondus. */
  const validatedCount = useMemo(
    () => Object.values(validated).reduce((sum, n) => sum + n, 0),
    [validated],
  );

  /**
   * Clôture la séance. Les séries sont déjà en base : il ne reste que la durée
   * et le ressenti. La file est vidée si possible, mais ne bloque jamais — ce
   * qui reste dedans est rejoué à la prochaine ouverture de la séance.
   */
  function finish() {
    setConfirmFinish(false);
    const durationSeconds = Math.round((Date.now() - startedAt.current) / 1000);
    const input: FinishSessionInput = { sessionId, feedback, durationSeconds };

    startTransition(async () => {
      try {
        const result = await finishSession(input);
        if (!result.ok) {
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

  function handleFinish() {
    setError(null);
    if (validatedCount === 0) {
      setError("Valide au moins une série avant de terminer.");
      return;
    }
    if (!persistence.hasPending) {
      finish();
      return;
    }
    // Dernière chance donnée au réseau, 5 s au plus : au-delà, on demande, on
    // ne bloque pas.
    setIsFlushing(true);
    void persistence.flush(5000).then((drained) => {
      setIsFlushing(false);
      if (drained) finish();
      else setConfirmFinish(true);
    });
  }

  const ex = allExercises[Math.min(currentIdx, allExercises.length - 1)]!;
  const rows = sets[ex.exerciseId] ?? [];
  const vcount = validated[ex.exerciseId] ?? 0;
  const activeIndex = vcount;
  const activeRow = rows[activeIndex];
  const exerciseDone = rows.length > 0 && vcount >= rows.length;
  const exProgress = progress.perExercise.find(
    (p) => p.exerciseId === ex.exerciseId,
  );
  const isLast = currentIdx >= allExercises.length - 1;
  const last = ex.last;
  // La croix de retrait ne vit que tant que l'exercice ajouté n'a aucune série
  // enregistrée : dès la première validation, il n'est plus « retirable ».
  const canRemove = ex.source === "extra" && vcount === 0;
  const usedExerciseIds = useMemo(
    () => allExercises.map((e) => e.exerciseId),
    [allExercises],
  );

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

  // CM-78 : séries validées hors réseau lors d'une ouverture précédente de la
  // page, retrouvées dans la file. Elles ne sont pas encore en base, donc
  // absentes de `initialSets` : sans ce rattrapage l'écran les proposerait de
  // nouveau à la saisie, et la même série finirait écrite deux fois.
  const restoredMerged = useRef(false);
  const restoredOps = persistence.restored;
  useEffect(() => {
    if (restoredOps === null || restoredMerged.current) return;
    restoredMerged.current = true;

    const byExercise = new Map<string, PendingSet[]>();
    for (const op of restoredOps) {
      if (op.kind !== "upsert") continue;
      const list = byExercise.get(op.set.exerciseId);
      if (list) list.push(op.set);
      else byExercise.set(op.set.exerciseId, [op.set]);
    }
    if (byExercise.size === 0) return;

    // L'effet ne tourne qu'au montage : `sets` et `validated` sont encore ceux
    // du serveur, on peut donc les recomposer sans passer par un updater.
    const nextSets: Record<string, SetField[]> = { ...sets };
    const nextValidated: Record<string, number> = { ...validated };
    let changed = false;

    for (const [exId, pendingSets] of byExercise) {
      const rows = nextSets[exId];
      if (!rows) continue; // Exercice absent de cette séance : rien à afficher.
      const known = new Set(
        rows.map((r) => r.id).filter((id): id is string => id !== null),
      );
      const out = [...rows];
      let cursor = nextValidated[exId] ?? 0;
      for (const set of pendingSets) {
        if (known.has(set.id)) continue;
        const row: SetField = {
          id: set.id,
          setIndex: set.setIndex,
          weight: formatWeight(set.weightKg),
          reps: String(set.reps),
          isWarmup: set.isWarmup,
          touched: true,
        };
        if (cursor < out.length) out[cursor] = row;
        else out.push(row);
        cursor += 1;
        changed = true;
      }
      nextSets[exId] = out;
      nextValidated[exId] = cursor;
    }

    if (!changed) return;
    setSets(nextSets);
    setValidated(nextValidated);
    setCurrentIdx(resumeExerciseIndex(exercises, nextValidated));
    // `sets` et `validated` sont lus une seule fois, au montage : les relire à
    // chaque validation relancerait ce rattrapage à tort.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restoredOps, exercises]);

  // On sort du mode saisie clavier dès qu'on change d'exercice ou de série.
  useEffect(() => {
    setEditingField(null);
  }, [currentIdx, activeIndex]);

  // On referme les confirmations en ligne en quittant l'exercice.
  useEffect(() => {
    setConfirmRemoveId(null);
    setConfirmDeleteSet(null);
  }, [currentIdx]);

  // CM-62 : scroll doux jusqu'à la carte du nouvel exercice, une seule fois,
  // après que le rendu l'a réellement placée.
  useEffect(() => {
    if (!scrollToCard.current) return;
    scrollToCard.current = false;
    cardRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [currentIdx]);

  // La barre épinglée est `fixed` : on réserve sa hauteur en haut du flux
  // (encoche comprise) pour qu'elle ne recouvre jamais le contenu.
  const contentPaddingTop = `calc(env(safe-area-inset-top) + ${
    SESSION_PROGRESS_BAR_HEIGHT + 2
  }px)`;

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
    <div
      className="mx-auto flex min-h-[100dvh] max-w-lg flex-col px-5 pb-6"
      style={{ paddingTop: contentPaddingTop }}
    >
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
            {currentIdx + 1}/{allExercises.length}
          </span>
          <button
            type="button"
            onClick={() => setCurrentIdx((i) => Math.min(allExercises.length - 1, i + 1))}
            disabled={isLast}
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-line bg-surface2 text-fg disabled:opacity-30"
            aria-label="Exercice suivant"
          >
            ›
          </button>
        </div>
      </div>

      {/* Barre épinglée : la progression y reste en permanence (CM-67), le
          timer ne s'ajoute au-dessus que pendant un repos sorti de l'écran. */}
      <RestTimerBar
        showTimer={isPinned && rest.state === "running"}
        remainingSeconds={rest.remainingSeconds}
        totalSeconds={rest.totalSeconds}
        onAddSeconds={rest.addSeconds}
        onSkip={skipRest}
      >
        <SessionProgressBar
          done={progress.done}
          total={progress.total}
          exercisesRemaining={progress.exercisesRemaining}
        />
      </RestTimerBar>

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

      {/* Carte exercice courant — atténuée quand toutes les séries prévues
          sont faites, mais jamais verrouillée : on peut encore en ajouter. */}
      <div
        ref={cardRef}
        className={`mt-4 flex-1 ${exProgress?.isComplete ? "opacity-60" : ""}`}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <div className="text-[11px] font-bold uppercase tracking-wide text-toi">
                Exercice {currentIdx + 1}
              </div>
              {ex.source === "extra" && (
                <span className="text-xs font-semibold text-fg-muted">
                  Hors programme
                </span>
              )}
              {canRemove && (
                <button
                  type="button"
                  onClick={() => setConfirmRemoveId(ex.exerciseId)}
                  className="text-fg-faint hover:text-fg"
                  aria-label={`Retirer ${ex.name} de la séance`}
                >
                  ✕
                </button>
              )}
            </div>
            <div className="mt-0.5 flex items-baseline gap-2">
              <h1 className="text-2xl font-black tracking-tight text-fg">
                {ex.name}
              </h1>
              {exProgress && (
                <span
                  className={`flex-none font-oswald text-xs font-bold ${
                    exProgress.isComplete ? "text-energy" : "text-fg-muted"
                  }`}
                >
                  {exProgress.isComplete
                    ? `✓ ${exProgress.done} / ${exProgress.planned}`
                    : `${exProgress.done} / ${exProgress.planned}`}
                </span>
              )}
            </div>
          </div>
          <ExerciseInfo name={ex.name} muscleGroup={ex.muscleGroup} />
        </div>
        <p className="mt-1 text-xs text-fg-muted">
          Objectif {ex.targetSets} × {ex.targetRepsMin}–{ex.targetRepsMax}
        </p>

        {/* Confirmation de retrait en ligne : `window.confirm` est inerte en
            PWA iOS standalone et dans la WKWebView Capacitor (cf. CM-70). */}
        {confirmRemoveId === ex.exerciseId && (
          <div className="mt-3 rounded-xl border border-flame/40 bg-flame/10 p-2.5">
            <p className="text-xs font-semibold text-flame">
              Retirer « {ex.name} » de la séance ?
            </p>
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                onClick={() => removeExtraExercise(ex.exerciseId)}
                className="flex-1 rounded-lg bg-flame py-2 text-xs font-extrabold text-ink"
              >
                Oui
              </button>
              <button
                type="button"
                onClick={() => setConfirmRemoveId(null)}
                className="flex-1 rounded-lg bg-surface2 py-2 text-xs font-semibold text-fg"
              >
                Non
              </button>
            </div>
          </div>
        )}

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
            {isLoadingLast && ex.source === "extra"
              ? "Recherche de ton historique…"
              : "Première fois sur cet exercice"}
          </div>
        )}

        {/* Liste des séries */}
        <div className="mt-3 flex flex-col gap-2">
          {rows.map((row, i) => {
            const done = i < vcount;
            const active = i === activeIndex;
            // CM-78 : écriture pas encore confirmée. Un point gris, discret :
            // rien n'est perdu, rien n'est à faire, la file s'en occupe.
            const waiting = row.id !== null && persistence.pendingIds.has(row.id);
            const deleteKey = `${ex.exerciseId}:${i}`;
            return (
              <div
                key={row.id ?? `row-${i}`}
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
                  className={`flex flex-1 items-center gap-1.5 text-[13px] font-bold ${
                    active ? "text-energy" : "text-fg-muted"
                  }`}
                >
                  {row.isWarmup ? "Échauffement" : done ? `Série ${i + 1}` : active ? "En cours" : "À venir"}
                  {waiting && (
                    <span
                      className="h-1.5 w-1.5 flex-none rounded-full bg-fg-faint"
                      aria-label="Enregistrement en cours"
                      title="Enregistrement en cours"
                    />
                  )}
                </span>
                {confirmDeleteSet === deleteKey ? (
                  <span className="flex items-center gap-1.5">
                    <span className="text-[11px] font-semibold text-flame">
                      Supprimer ?
                    </span>
                    <button
                      type="button"
                      onClick={() => removeValidatedSet(ex.exerciseId, i)}
                      className="rounded-lg bg-flame px-2 py-1 text-[11px] font-extrabold text-ink"
                    >
                      Oui
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteSet(null)}
                      className="rounded-lg bg-surface2 px-2 py-1 text-[11px] font-semibold text-fg"
                    >
                      Non
                    </button>
                  </span>
                ) : (
                  <>
                    <span className="font-oswald text-base text-fg">
                      {done || (active && row.weight !== "")
                        ? `${row.weight || 0} kg `
                        : "— kg "}
                      <span className="text-fg-muted">×</span>{" "}
                      {done || (active && row.reps !== "") ? row.reps || 0 : "—"}
                    </span>
                    {done && (
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteSet(deleteKey)}
                        className="-mr-1 flex-none px-1 text-fg-faint hover:text-flame"
                        aria-label={`Supprimer la série ${i + 1}`}
                      >
                        ✕
                      </button>
                    )}
                  </>
                )}
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
                      commitDirect(ex.exerciseId, activeIndex, "weight", raw)
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
                  onClick={() => step(ex.exerciseId, activeIndex, "weight", -2.5)}
                  className="flex h-11 items-center justify-center rounded-2xl border border-line bg-surface2 font-oswald text-base font-semibold text-fg active:bg-white/10"
                  aria-label="Moins 2,5 kg"
                >
                  −2.5
                </button>
                <button
                  type="button"
                  onClick={() => step(ex.exerciseId, activeIndex, "weight", -1)}
                  className="flex h-11 items-center justify-center rounded-2xl border border-line bg-surface2 text-2xl text-fg active:bg-white/10"
                  aria-label="Moins 1 kg"
                >
                  −
                </button>
                <button
                  type="button"
                  onClick={() => step(ex.exerciseId, activeIndex, "weight", 1)}
                  className="flex h-11 items-center justify-center rounded-2xl bg-energy text-2xl font-bold text-ink"
                  aria-label="Plus 1 kg"
                >
                  +
                </button>
                <button
                  type="button"
                  onClick={() => step(ex.exerciseId, activeIndex, "weight", 2.5)}
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
                      commitDirect(ex.exerciseId, activeIndex, "reps", raw)
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
                  onClick={() => step(ex.exerciseId, activeIndex, "reps", -1)}
                  className="flex h-11 items-center justify-center rounded-2xl border border-line bg-surface2 text-2xl text-fg active:bg-white/10"
                  aria-label="Moins 1 répétition"
                >
                  −
                </button>
                <button
                  type="button"
                  onClick={() => step(ex.exerciseId, activeIndex, "reps", 1)}
                  className="flex h-11 items-center justify-center rounded-2xl bg-energy text-2xl font-bold text-ink"
                  aria-label="Plus 1 répétition"
                >
                  +
                </button>
              </div>
            </div>

            <button
              type="button"
              onClick={() => toggleWarmup(ex.exerciseId, activeIndex)}
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
            onClick={() => addRow(ex.exerciseId)}
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

      {/* CM-62 : hors de la carte, qui s'atténue une fois l'exercice terminé —
          le bouton reste lisible même quand toute la séance est faite. Une
          machine occupée ou une envie qui change n'attend pas ; le programme,
          lui, n'est jamais modifié. */}
      <button
        type="button"
        onClick={() => setSheetOpen(true)}
        className="mt-5 w-full rounded-xl border border-dashed border-line py-3 text-sm font-semibold text-fg-muted active:bg-white/5"
      >
        + Ajouter un exercice
      </button>

      {/* Action principale */}
      <div className="sticky bottom-0 -mx-5 mt-4 bg-ink/90 px-5 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur">
        {!exerciseDone ? (
          <button
            type="button"
            onClick={() =>
              activeRow
                ? validateSet(ex.exerciseId, activeIndex, ex.restSeconds)
                : addRow(ex.exerciseId)
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
            disabled={isPending || isFlushing}
            className="w-full rounded-2xl bg-energy py-4 text-[17px] font-extrabold text-ink disabled:opacity-50"
          >
            {isPending || isFlushing ? "Enregistrement…" : "Terminer la séance"}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setCurrentIdx((i) => Math.min(allExercises.length - 1, i + 1))}
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
            disabled={isPending || isFlushing}
            className="mt-2 w-full py-1 text-center text-xs font-semibold text-fg-muted hover:text-fg disabled:opacity-50"
          >
            {isFlushing ? "Enregistrement…" : "Terminer maintenant"}
          </button>
        )}

        {/* CM-78 : la file n'a pas réussi à écrire trois fois de suite. On le
            dit, sans alarmer ni bloquer — le réessai est automatique. */}
        {persistence.isStalled && !confirmFinish && (
          <p className="mt-2 text-center text-[11px] font-medium text-fg-muted">
            Enregistrement en attente, réessai automatique
          </p>
        )}

        {/* Confirmation custom : `window.confirm` est inerte en PWA iOS
            standalone (cf. CM-70). Terminer sans attendre ne perd rien, la file
            est rejouée à la prochaine ouverture de la séance. */}
        {confirmFinish && (
          <div className="mt-2 rounded-xl border border-flame/40 bg-flame/10 p-3">
            <p className="text-xs font-semibold text-flame">
              Certaines séries ne sont pas encore enregistrées. Terminer quand
              même ?
            </p>
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                onClick={finish}
                disabled={isPending}
                className="flex-1 rounded-lg bg-flame py-2 text-xs font-extrabold text-ink disabled:opacity-50"
              >
                Terminer
              </button>
              <button
                type="button"
                onClick={() => setConfirmFinish(false)}
                className="flex-1 rounded-lg bg-surface2 py-2 text-xs font-semibold text-fg"
              >
                Attendre
              </button>
            </div>
          </div>
        )}
      </div>

      <AddExerciseSheet
        open={sheetOpen}
        catalog={catalogState}
        usedExerciseIds={usedExerciseIds}
        canCreateExercise={canCreateExercise}
        onSelect={addExtraExercise}
        onCreated={(exercise) => {
          setCatalogState((prev) => [...prev, exercise]);
          addExtraExercise(exercise);
        }}
        onClose={() => setSheetOpen(false)}
      />
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
