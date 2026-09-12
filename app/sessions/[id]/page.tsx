import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireProfileId, getCoupleId } from "@/lib/profile";
import { getDayWithExercises } from "@/lib/queries/programs";
import type { ProgramDayFull } from "@/lib/queries/programs";
import { getCatalogExercises } from "@/lib/queries/exercises";
import type { SystemExercise } from "@/lib/queries/exercises";
import {
  buildSessionExercises,
  type ExtraExerciseInput,
} from "@/lib/utils/sessionExercises";
import {
  getSession,
  getSessionSets,
  getLastSetsByExercise,
  getAllSetsForProgress,
} from "@/lib/queries/sessions";
import type {
  SessionRow,
  SessionSetRow,
  ProgressRow,
} from "@/lib/queries/sessions";
import {
  bestE1RM,
  totalVolume,
  formatWeight,
  formatDateLong,
  estimatedOneRepMax,
} from "@/lib/utils/training";
import { suggestFirstSet } from "@/lib/utils/prefill";
import SessionLogger, {
  type LoggerExercise,
  type InitialSet,
} from "./SessionLogger";
import PendingSetsSync from "@/components/PendingSetsSync";
import { deleteSession, updateSet, deleteSet } from "./actions";

const FEEDBACK_LABELS: Record<string, string> = {
  easy: "Facile",
  normal: "Normal",
  hard: "Dur",
  failure: "Échec",
};

export default async function SessionPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ edit?: string; editsets?: string }>;
}) {
  const { id } = await params;
  const { edit, editsets } = await searchParams;

  const profileId = await requireProfileId();
  const supabase = await createClient();

  const { data: sessionData } = await getSession(supabase, id);
  const session = sessionData as SessionRow | null;
  if (!session) {
    notFound();
  }

  const isMine = session.profile_id === profileId;
  const editSets = isMine && edit !== "1" && editsets === "1";

  const { data: setsData } = await getSessionSets(supabase, id);
  const existingSets = (setsData ?? []) as SessionSetRow[];

  // CM-78 : depuis l'écriture incrémentale, « la séance a des séries » ne veut
  // plus dire « la séance est terminée » — la première série part en base au
  // premier « Valider ». Le seul marqueur de fin est `duration_seconds`, celui
  // que le dashboard utilise déjà pour la séance en cours du partenaire.
  const inProgress = session.duration_seconds === null;
  const loggerMode = isMine && (inProgress || edit === "1");

  // ---------- Mode saisie ----------
  if (loggerMode) {
    if (!session.program_day_id) {
      notFound();
    }
    const { data: dayData } = await getDayWithExercises(
      supabase,
      session.program_day_id,
    );
    const day = dayData as ProgramDayFull | null;
    if (!day) {
      notFound();
    }

    const programExercises = day.program_exercises;
    const programIds = new Set(programExercises.map((pe) => pe.exercise_id));

    // CM-62 : toute série dont l'exercice n'est pas au programme du jour
    // définit un exercice hors programme. Un seul `select` par lot d'ids pour
    // récupérer nom et groupe musculaire, jamais une requête par exercice.
    const extraIds = Array.from(
      new Set(
        existingSets
          .map((s) => s.exercise_id)
          .filter((exId) => !programIds.has(exId)),
      ),
    );
    const extraExercises: ExtraExerciseInput[] = [];
    if (extraIds.length > 0) {
      const { data: extraData } = await supabase
        .from("exercises")
        .select("id, name, muscle_group")
        .in("id", extraIds)
        .returns<{ id: string; name: string; muscle_group: string }[]>();
      for (const row of extraData ?? []) {
        extraExercises.push({
          exerciseId: row.id,
          name: row.name,
          muscleGroup: row.muscle_group,
        });
      }
    }

    const sessionExercises = buildSessionExercises(
      programExercises,
      existingSets,
      extraExercises,
    );

    const lastByExercise = await getLastSetsByExercise(
      supabase,
      profileId,
      sessionExercises.map((e) => e.exerciseId),
      id,
    );

    const exercises: LoggerExercise[] = sessionExercises.map((e) => ({
      ...e,
      last: lastByExercise[e.exerciseId] ?? null,
    }));

    // Catalogue d'ajout en séance (système + persos du couple), chargé ici
    // pour que la bottom sheet n'ait aucune requête à faire côté client.
    const coupleId = await getCoupleId(supabase, profileId);
    const { data: catalogData } = await getCatalogExercises(supabase, coupleId);
    const catalog = (catalogData ?? []) as SystemExercise[];

    // Pré-remplissage des champs.
    const initialSets: Record<string, InitialSet[]> = {};
    const existingByExercise: Record<string, SessionSetRow[]> = {};
    for (const s of existingSets) {
      (existingByExercise[s.exercise_id] ??= []).push(s);
    }

    for (const e of sessionExercises) {
      const existing = existingByExercise[e.exerciseId];
      const logged = [...(existing ?? [])]
        .sort((a, b) => a.set_index - b.set_index)
        .map<InitialSet>((s) => ({
          id: s.id,
          setIndex: s.set_index,
          weight: formatWeight(s.weight_kg),
          reps: String(s.reps),
          isWarmup: s.is_warmup,
        }));

      if (logged.length > 0 && !inProgress) {
        // Mode « Modifier » d'une séance terminée : exactement ses séries.
        initialSets[e.exerciseId] = logged;
        continue;
      }

      const last = lastByExercise[e.exerciseId] ?? null;
      const count = Math.max(1, e.targetSets);
      // CM-68 : seule la série 1 est pré-remplie depuis le passé (suggestion
      // CM-50 / dernière séance CM-19). Les séries suivantes se remplissent
      // par propagation à la validation de la série précédente.
      const firstSuggestion = suggestFirstSet(
        last,
        e.targetRepsMin,
        e.targetRepsMax,
      );
      // CM-78, reprise : les séries déjà écrites, puis de quoi finir
      // l'exercice. La première ligne vide hérite de la dernière série
      // effective de la séance, comme le ferait la propagation si la page
      // n'avait jamais été rechargée.
      const lastEffective = [...logged]
        .reverse()
        .find((r) => !r.isWarmup && (r.weight !== "" || r.reps !== ""));
      const empty = Math.max(0, count - logged.length);
      initialSets[e.exerciseId] = [
        ...logged,
        ...Array.from({ length: empty }, (_, i): InitialSet => {
          const blank = { id: null, setIndex: null, isWarmup: false };
          if (i > 0) return { ...blank, weight: "", reps: "" };
          if (lastEffective) {
            return {
              ...blank,
              weight: lastEffective.weight,
              reps: lastEffective.reps,
            };
          }
          if (firstSuggestion && logged.length === 0) {
            return {
              ...blank,
              weight: firstSuggestion.weight,
              reps: firstSuggestion.reps,
            };
          }
          return { ...blank, weight: "", reps: "" };
        }),
      ];
    }

    return (
      <main className="min-h-screen p-4">
        <SessionLogger
          sessionId={id}
          dayName={day.name}
          exercises={exercises}
          initialSets={initialSets}
          catalog={catalog}
          canCreateExercise={coupleId !== null}
        />
      </main>
    );
  }

  // ---------- Mode récap (lecture) ----------
  // Nom de la séance type.
  let dayName = "Séance";
  if (session.program_day_id) {
    const { data: dayData } = await getDayWithExercises(
      supabase,
      session.program_day_id,
    );
    if (dayData) dayName = (dayData as ProgramDayFull).name;
  }

  // Noms d'exercices.
  const setExerciseIds = Array.from(
    new Set(existingSets.map((s) => s.exercise_id)),
  );
  const exerciseNames: Record<string, string> = {};
  if (setExerciseIds.length > 0) {
    const { data: exData } = await supabase
      .from("exercises")
      .select("id, name")
      .in("id", setExerciseIds)
      .returns<{ id: string; name: string }[]>();
    for (const ex of exData ?? []) exerciseNames[ex.id] = ex.name;
  }

  // Données historiques pour détecter les records (relatif au propriétaire).
  const { data: allSetsData } = await getAllSetsForProgress(
    supabase,
    session.profile_id,
  );
  const allSets = (allSetsData ?? []) as ProgressRow[];

  // Regroupe les séries de la séance par exercice.
  const setsByExercise: Record<string, SessionSetRow[]> = {};
  for (const s of existingSets) {
    (setsByExercise[s.exercise_id] ??= []).push(s);
  }

  // Pour chaque exercice: best e1RM de cette séance vs meilleur antérieur.
  const prByExercise: Record<string, boolean> = {};
  for (const exId of Object.keys(setsByExercise)) {
    const thisBest = bestE1RM(
      setsByExercise[exId]!.filter((s) => !s.is_warmup),
    );
    let priorBest = 0;
    for (const row of allSets) {
      if (row.exercise_id !== exId) continue;
      const performedAt = row.sessions?.performed_at;
      if (!performedAt || performedAt >= session.performed_at) continue;
      const e = estimatedOneRepMax(row.weight_kg, row.reps);
      if (e > priorBest) priorBest = e;
    }
    prByExercise[exId] = priorBest > 0 && thisBest > priorBest + 0.01;
  }

  const orderedExerciseIds = Object.keys(setsByExercise);
  const sessionVolume = totalVolume(existingSets.filter((s) => !s.is_warmup));
  const prCount = Object.values(prByExercise).filter(Boolean).length;
  const durationMin = session.duration_seconds
    ? Math.round(session.duration_seconds / 60)
    : null;

  return (
    <main className="min-h-screen p-4 pb-24">
      {/* CM-78 : séance terminée alors que des séries attendaient encore leur
          écriture. Le logger n'est plus là pour vider la file, ce composant
          prend le relais et rafraîchit le récap dès qu'elle est vide. */}
      {isMine && <PendingSetsSync sessionId={id} />}
      <div className="mx-auto max-w-lg">
        <div className="flex items-center justify-between">
          <Link href="/history" className="text-sm text-fg-muted hover:text-fg">
            ← Historique
          </Link>
          {isMine && (
            <Link
              href={editSets ? `/sessions/${id}` : `/sessions/${id}?editsets=1`}
              className="text-sm font-semibold text-energy"
            >
              {editSets ? "Terminer" : "Corriger les séries"}
            </Link>
          )}
        </div>

        <h1 className="mt-3 text-2xl font-bold">{dayName}</h1>
        <p className="mt-1 text-sm text-fg-muted">
          {formatDateLong(session.performed_at)}
          {durationMin !== null ? ` · ${durationMin} min` : ""}
          {session.feedback
            ? ` · ${FEEDBACK_LABELS[session.feedback] ?? session.feedback}`
            : ""}
        </p>

        {prCount > 0 && (
          <div className="mt-4 rounded-xl bg-toi/15 px-4 py-3 text-sm font-medium text-toi">
            🏆 {prCount} nouveau{prCount > 1 ? "x" : ""} record
            {prCount > 1 ? "s" : ""} sur cette séance !
          </div>
        )}

        <div className="mt-4 grid grid-cols-2 gap-3">
          <div className="rounded-xl bg-surface p-3">
            <p className="text-xs text-fg-muted">Volume total</p>
            <p className="mt-1 text-lg font-bold">
              {Math.round(sessionVolume).toLocaleString("fr-FR")} kg
            </p>
          </div>
          <div className="rounded-xl bg-surface p-3">
            <p className="text-xs text-fg-muted">Exercices</p>
            <p className="mt-1 text-lg font-bold">
              {orderedExerciseIds.length}
            </p>
          </div>
        </div>

        <div className="mt-4 space-y-3">
          {orderedExerciseIds.map((exId) => {
            const rows = [...setsByExercise[exId]!].sort(
              (a, b) => a.set_index - b.set_index,
            );
            return (
              <section key={exId} className="rounded-xl bg-surface p-4">
                <div className="flex items-center justify-between">
                  <h2 className="font-semibold">
                    {exerciseNames[exId] ?? "Exercice"}
                  </h2>
                  {prByExercise[exId] && (
                    <span className="rounded-full bg-toi/20 px-2 py-0.5 text-xs font-medium text-toi">
                      🏆 Record
                    </span>
                  )}
                </div>
                <ul className="mt-2 flex flex-wrap gap-2">
                  {rows.map((r) =>
                    editSets ? (
                      <li key={r.id} className="flex items-center gap-2 rounded-lg bg-surface2 px-2.5 py-1.5 text-sm">
                        <form action={updateSet} className="flex items-center gap-1.5">
                          <input type="hidden" name="set_id" value={r.id} />
                          <input type="hidden" name="session_id" value={id} />
                          <input
                            name="weight"
                            defaultValue={formatWeight(r.weight_kg)}
                            inputMode="decimal"
                            className="w-14 rounded bg-ink px-2 py-1 text-center text-fg"
                          />
                          <span className="text-fg-muted">×</span>
                          <input
                            name="reps"
                            defaultValue={String(r.reps)}
                            inputMode="numeric"
                            className="w-12 rounded bg-ink px-2 py-1 text-center text-fg"
                          />
                          <button type="submit" className="rounded bg-energy px-2 py-1 font-bold text-ink" aria-label="Enregistrer">
                            ✓
                          </button>
                        </form>
                        <form action={deleteSet}>
                          <input type="hidden" name="set_id" value={r.id} />
                          <input type="hidden" name="session_id" value={id} />
                          <button type="submit" className="px-1 text-fg-faint hover:text-red-400" aria-label="Supprimer">
                            ✕
                          </button>
                        </form>
                      </li>
                    ) : (
                      <li
                        key={r.id}
                        className={`rounded-lg px-3 py-1.5 text-sm ${
                          r.is_warmup ? "bg-surface2/50 text-fg-muted" : "bg-surface2"
                        }`}
                      >
                        <span className="font-medium">{formatWeight(r.weight_kg)}</span>
                        <span className="text-fg-muted"> kg × </span>
                        <span className="font-medium">{r.reps}</span>
                        {r.is_warmup && (
                          <span className="ml-1 text-[10px] uppercase">éch.</span>
                        )}
                      </li>
                    ),
                  )}
                </ul>
              </section>
            );
          })}
        </div>

        {isMine && (
          <div className="mt-6 flex gap-3">
            <Link
              href={`/sessions/${id}?edit=1`}
              className="flex-1 rounded-lg bg-surface2 py-3 text-center text-sm font-semibold text-fg"
            >
              Modifier
            </Link>
            <form action={deleteSession} className="flex-1">
              <input type="hidden" name="session_id" value={id} />
              <SubmitDelete />
            </form>
          </div>
        )}
      </div>
    </main>
  );
}

function SubmitDelete() {
  return (
    <button
      type="submit"
      className="w-full rounded-lg bg-surface2 py-3 text-sm font-semibold text-red-400"
    >
      Supprimer
    </button>
  );
}
