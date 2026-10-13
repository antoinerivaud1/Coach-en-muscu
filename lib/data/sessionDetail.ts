import type { BrowserSupabase } from "@/lib/supabase/client";
import { getDayWithExercises, type ProgramDayFull } from "@/lib/queries/programs";
import { getCatalogExercises, type SystemExercise } from "@/lib/queries/exercises";
import { readDuoId } from "@/lib/queries/profiles";
import {
  getAllSetsForProgress,
  getLastSetsByExercise,
  getSession,
  getSessionSets,
  type LastExerciseData,
  type SessionRow,
  type SessionSetRow,
} from "@/lib/queries/sessions";
import {
  buildSessionExercises,
  type ExtraExerciseInput,
  type SessionExercise,
} from "@/lib/utils/sessionExercises";
import { bestE1RM, estimatedOneRepMax, formatWeight, totalVolume } from "@/lib/utils/training";
import { suggestFirstSet } from "@/lib/utils/prefill";

/**
 * CM-88 (PR 6) : lecture de l'écran de séance (`/sessions/view?id=`), côté
 * navigateur et sous RLS. Reprend à l'identique ce que faisait la page
 * serveur, en deux modes :
 * - `logger` : saisie (séance en cours, ou séance terminée rouverte par
 *   « Modifier », `?edit=1`) ;
 * - `recap` : lecture d'une séance terminée (la mienne ou celle de mon
 *   partenaire de duo).
 *
 * Convention `lib/data/*` : une lecture en échec LÈVE. Surtout ici : des
 * séries lues « vides » par erreur feraient ressaisir des séries déjà en base.
 * Seule la « dernière fois » reste opportuniste (pré-remplissage).
 *
 * Accès : la RLS ne laisse lire que mes séances et celles de mon partenaire
 * de duo actif (CM-59). Le navigateur n'a jamais la clé service-role : la RLS
 * suffit, sans contrôle d'appartenance en code pour la lecture.
 * Une séance invisible ou inexistante donne `notFound`, sans distinction.
 */

export type Feedback = "easy" | "normal" | "hard" | "failure";

/**
 * Un exercice de la séance, du programme ou ajouté en cours de route (CM-62) :
 * forme unique (`SessionExercise`), plus l'historique « dernière fois ».
 */
export type LoggerExercise = SessionExercise & {
  last: LastExerciseData | null;
};

/**
 * Série à afficher dans le logger. `id` non nul = série déjà en base (séance
 * en cours reprise, ou séance terminée rouverte en modification) ; `id` nul =
 * ligne vide ou pré-remplie, qui n'existera en base qu'à sa validation.
 */
export type InitialSet = {
  id: string | null;
  setIndex: number | null;
  weight: string;
  reps: string;
  isWarmup: boolean;
};

export type LoggerData = {
  kind: "logger";
  ownerId: string;
  ownerAccent: string | null;
  sessionId: string;
  dayName: string;
  startedAt: string;
  finishedDurationSeconds: number | null;
  initialFeedback: Feedback | null;
  exercises: LoggerExercise[];
  initialSets: Record<string, InitialSet[]>;
  catalog: SystemExercise[];
  canCreateExercise: boolean;
};

export type RecapExercise = {
  exerciseId: string;
  /** `null` : exercice perso du partenaire, illisible (CM-103). */
  name: string | null;
  isRecord: boolean;
  sets: SessionSetRow[];
};

export type RecapData = {
  kind: "recap";
  sessionId: string;
  isMine: boolean;
  ownerAccent: string | null;
  ownerName: string | null;
  dayName: string;
  performedAt: string;
  durationSeconds: number | null;
  feedback: Feedback | null;
  exercises: RecapExercise[];
  volume: number;
  recordCount: number;
};

export type SessionScreenData = { kind: "notFound" } | LoggerData | RecapData;

const READ_ERROR = "Impossible de charger la séance.";

export async function fetchSessionScreen(
  supabase: BrowserSupabase,
  profileId: string,
  sessionId: string,
  editRequested: boolean,
): Promise<SessionScreenData> {
  const { data: session, error: sessionError } = await getSession(supabase, sessionId);
  if (sessionError) throw new Error(READ_ERROR);
  if (!session) return { kind: "notFound" };

  const isMine = session.profile_id === profileId;

  const [ownerRead, setsRead] = await Promise.all([
    // CM-87 : accent du membre à qui est la séance (classes `*-member`).
    // CM-103 : et son prénom (« Exercice personnel de <prénom> »).
    supabase
      .from("profiles")
      .select("accent_color, display_name")
      .eq("id", session.profile_id)
      .returns<{ accent_color: string; display_name: string }[]>()
      .maybeSingle(),
    getSessionSets(supabase, sessionId),
  ]);
  if (ownerRead.error || setsRead.error) throw new Error(READ_ERROR);
  const owner = ownerRead.data;
  const existingSets = setsRead.data ?? [];

  // CM-78 : le seul marqueur de fin est `duration_seconds`.
  const inProgress = session.duration_seconds === null;
  if (isMine && (inProgress || editRequested)) {
    return loadLogger(supabase, profileId, session, existingSets, inProgress, owner?.accent_color ?? null);
  }
  // Séance en cours du partenaire : rien à saisir pour moi, le récap montre
  // ses séries du moment (comportement de la page serveur).
  return loadRecap(supabase, profileId, session, existingSets, isMine, owner);
}

/**
 * CM-90 (PR 2) : id fictif d'une séance pas encore créée (pack séance). Un
 * uuid valide : `getLastSetsByExercise` l'exclut sans erreur (rien ne porte
 * cet id).
 */
export const PACK_SESSION_ID = "00000000-0000-0000-0000-000000000000";

/**
 * CM-90 (PR 2) : « pack séance », préparé en ligne pour démarrer hors ligne.
 * Exactement ce que l'écran de saisie lirait pour une séance NEUVE de cette
 * séance type (exercices, dernière fois, pré-remplissage, catalogue), avec
 * un id de séance fictif (`PACK_SESSION_ID`) remplacé au démarrage.
 *
 * `null` : séance type introuvable ou plus accessible. LÈVE si une lecture
 * échoue (réseau) : l'ancien pack, s'il existe, est alors conservé.
 */
export async function fetchDayPack(
  supabase: BrowserSupabase,
  profileId: string,
  dayId: string,
  now: Date,
): Promise<LoggerData | null> {
  const { data: owner, error } = await supabase
    .from("profiles")
    .select("accent_color")
    .eq("id", profileId)
    .returns<{ accent_color: string }[]>()
    .maybeSingle();
  if (error) throw new Error(READ_ERROR);
  const fresh: SessionRow = {
    id: PACK_SESSION_ID,
    profile_id: profileId,
    program_day_id: dayId,
    performed_at: now.toISOString(),
    duration_seconds: null,
    feedback: null,
    notes: null,
  };
  const data = await loadLogger(supabase, profileId, fresh, [], true, owner?.accent_color ?? null);
  return data.kind === "logger" ? data : null;
}

async function loadLogger(
  supabase: BrowserSupabase,
  profileId: string,
  session: SessionRow,
  existingSets: SessionSetRow[],
  inProgress: boolean,
  ownerAccent: string | null,
): Promise<SessionScreenData> {
  if (!session.program_day_id) return { kind: "notFound" };
  const { data: dayData, error: dayError } = await getDayWithExercises(
    supabase,
    session.program_day_id,
  );
  if (dayError) throw new Error(READ_ERROR);
  const day = dayData as ProgramDayFull | null;
  if (!day) return { kind: "notFound" };

  const programExercises = day.program_exercises;
  const programIds = new Set(programExercises.map((pe) => pe.exercise_id));

  // CM-62 : toute série dont l'exercice n'est pas au programme du jour
  // définit un exercice hors programme. Un seul `select` par lot d'ids.
  const extraIds = Array.from(
    new Set(existingSets.map((s) => s.exercise_id).filter((id) => !programIds.has(id))),
  );
  const extraExercises: ExtraExerciseInput[] = [];
  if (extraIds.length > 0) {
    const { data: extraData, error } = await supabase
      .from("exercises")
      .select("id, name, muscle_group")
      .in("id", extraIds)
      .returns<{ id: string; name: string; muscle_group: string }[]>();
    if (error) throw new Error(READ_ERROR);
    for (const row of extraData ?? []) {
      extraExercises.push({ exerciseId: row.id, name: row.name, muscleGroup: row.muscle_group });
    }
  }

  const sessionExercises = buildSessionExercises(programExercises, existingSets, extraExercises);

  // Catalogue d'ajout en séance (système + persos), chargé ici pour que la
  // bottom sheet n'ait aucune requête à faire. « Dernière fois » en parallèle.
  // Lecture du duo en échec : erreur, pas « solo ». Le logger figerait sinon
  // pour toute la séance un catalogue sans les exercices du duo.
  const duo = await readDuoId(supabase, profileId);
  if (!duo.ok) throw new Error(READ_ERROR);
  const duoId = duo.duoId;
  const [lastByExercise, catalogRead] = await Promise.all([
    getLastSetsByExercise(
      supabase,
      profileId,
      sessionExercises.map((e) => e.exerciseId),
      session.id,
    ),
    getCatalogExercises(supabase, duoId, profileId),
  ]);
  if (catalogRead.error) throw new Error(READ_ERROR);

  const exercises: LoggerExercise[] = sessionExercises.map((e) => ({
    ...e,
    last: lastByExercise[e.exerciseId] ?? null,
  }));

  return {
    kind: "logger",
    ownerId: session.profile_id,
    ownerAccent,
    sessionId: session.id,
    dayName: day.name,
    startedAt: session.performed_at,
    finishedDurationSeconds: session.duration_seconds,
    initialFeedback: session.feedback,
    exercises,
    initialSets: buildInitialSets(sessionExercises, existingSets, lastByExercise, inProgress),
    catalog: (catalogRead.data ?? []) as SystemExercise[],
    canCreateExercise: duoId !== null,
  };
}

/**
 * Pré-remplissage des champs du logger (logique de la page serveur, inchangée).
 * Exporté pour les tests unitaires.
 */
export function buildInitialSets(
  sessionExercises: readonly SessionExercise[],
  existingSets: readonly SessionSetRow[],
  lastByExercise: Record<string, LastExerciseData>,
  inProgress: boolean,
): Record<string, InitialSet[]> {
  const initialSets: Record<string, InitialSet[]> = {};
  const existingByExercise: Record<string, SessionSetRow[]> = {};
  for (const s of existingSets) {
    (existingByExercise[s.exercise_id] ??= []).push(s);
  }

  for (const e of sessionExercises) {
    const logged = [...(existingByExercise[e.exerciseId] ?? [])]
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
    // CM-68 : seule la série 1 est pré-remplie depuis le passé.
    const firstSuggestion = suggestFirstSet(last, e.targetRepsMin, e.targetRepsMax);
    // CM-78, reprise : les séries déjà écrites, puis de quoi finir
    // l'exercice. La première ligne vide hérite de la dernière série
    // effective de la séance.
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
          return { ...blank, weight: lastEffective.weight, reps: lastEffective.reps };
        }
        if (firstSuggestion && logged.length === 0) {
          return { ...blank, weight: firstSuggestion.weight, reps: firstSuggestion.reps };
        }
        return { ...blank, weight: "", reps: "" };
      }),
    ];
  }
  return initialSets;
}

async function loadRecap(
  supabase: BrowserSupabase,
  profileId: string,
  session: SessionRow,
  existingSets: SessionSetRow[],
  isMine: boolean,
  owner: { accent_color: string; display_name: string } | null,
): Promise<RecapData> {
  const setExerciseIds = Array.from(new Set(existingSets.map((s) => s.exercise_id)));

  const [dayRead, exRead, allSetsRead] = await Promise.all([
    session.program_day_id
      ? getDayWithExercises(supabase, session.program_day_id)
      : Promise.resolve({ data: null, error: null }),
    setExerciseIds.length > 0
      ? supabase
          .from("exercises")
          .select("id, name, owner_profile_id")
          .in("id", setExerciseIds)
          .returns<{ id: string; name: string; owner_profile_id: string | null }[]>()
      : Promise.resolve({ data: [], error: null }),
    // Historique du propriétaire, pour détecter les records.
    getAllSetsForProgress(supabase, session.profile_id),
  ]);
  if (exRead.error || allSetsRead.error) throw new Error(READ_ERROR);
  // Séance type supprimée ou illisible : « Séance », comme avant.
  const dayName = (dayRead.data as ProgramDayFull | null)?.name ?? "Séance";

  // CM-103 : un exercice perso du partenaire est illisible sous RLS ; écarté
  // aussi en code, il s'affiche en « Exercice personnel de <prénom> ».
  const names: Record<string, string> = {};
  for (const ex of exRead.data ?? []) {
    if (ex.owner_profile_id && ex.owner_profile_id !== profileId) continue;
    names[ex.id] = ex.name;
  }

  const setsByExercise: Record<string, SessionSetRow[]> = {};
  for (const s of existingSets) (setsByExercise[s.exercise_id] ??= []).push(s);

  const allSets = allSetsRead.data ?? [];
  const exercises: RecapExercise[] = Object.keys(setsByExercise).map((exId) => {
    const rows = [...setsByExercise[exId]!].sort((a, b) => a.set_index - b.set_index);
    // Meilleur e1RM de cette séance contre le meilleur antérieur.
    const thisBest = bestE1RM(rows.filter((s) => !s.is_warmup));
    let priorBest = 0;
    for (const row of allSets) {
      if (row.exercise_id !== exId) continue;
      const performedAt = row.sessions?.performed_at;
      if (!performedAt || performedAt >= session.performed_at) continue;
      const e = estimatedOneRepMax(row.weight_kg, row.reps);
      if (e > priorBest) priorBest = e;
    }
    return {
      exerciseId: exId,
      name: names[exId] ?? null,
      isRecord: priorBest > 0 && thisBest > priorBest + 0.01,
      sets: rows,
    };
  });

  const volume = totalVolume(existingSets.filter((s) => !s.is_warmup));

  return {
    kind: "recap",
    sessionId: session.id,
    isMine,
    ownerAccent: owner?.accent_color ?? null,
    ownerName: owner?.display_name ?? null,
    dayName,
    performedAt: session.performed_at,
    durationSeconds: session.duration_seconds,
    feedback: session.feedback,
    exercises,
    volume,
    recordCount: exercises.filter((e) => e.isRecord).length,
  };
}
