import { isAuthRetryableFetchError } from "@supabase/supabase-js";
import type { BrowserSupabase } from "@/lib/supabase/client";
import type { Database } from "@/lib/types/database";
import { getLastSetsByExercise, type LastExerciseData } from "@/lib/queries/sessions";
import { closingDurationSeconds } from "@/lib/utils/currentSession";
import {
  REFUSED_MESSAGE,
  SESSION_EXPIRED_MESSAGE,
  isRlsDenied,
  touchedRows,
  writeErrorMessage,
} from "@/lib/supabase/rlsErrors";

/**
 * CM-88 (PR 6) : écritures de l'écran de séance, depuis le navigateur et sous
 * RLS. Remplacent les server actions `app/sessions/[id]/actions.ts` et
 * `lib/actions/sessionSets.ts` (supprimées).
 *
 * Aucune n'a besoin d'une fonction SQL : chacune est UNE écriture (la
 * suppression d'une séance emporte ses séries par `ON DELETE CASCADE`,
 * vérifié en prod), précédée au plus de lectures.
 *
 * Deux familles :
 * - les écritures des FILES hors ligne (séries, clôture) renvoient
 *   `{ ok: false, refused | expired }` comme les anciennes server actions :
 *   `refused` = définitif (mis de côté), tout le reste est rejoué ;
 * - les écritures d'écran (récap, bandeau de l'accueil, abandon) renvoient
 *   `{ ok }` ou `{ ok: false, error }`, message en français, à afficher.
 *
 * Erreur réseau : supabase-js ne LÈVE pas, il renvoie une erreur sans `code`
 * (les erreurs Postgres et PostgREST en ont toujours un). `isTransportError`
 * la reconnaît : la clôture LÈVE alors (le logger range la séance dans la
 * file hors ligne, comme quand la server action était injoignable).
 */

type FeedbackValue = Database["public"]["Enums"]["session_feedback"];

export type ActionResult =
  | { ok: true }
  | { ok: false; error: string; refused?: true; expired?: true };

export type ScreenWriteResult = { ok: true } | { ok: false; error: string };

/** Erreur sans code : requête qui n'a pas abouti (hors ligne, coupure, 5xx brut). */
export function isTransportError(error: { code?: string | null } | null | undefined): boolean {
  return !!error && !error.code;
}

export class OfflineError extends Error {
  constructor(message = "Hors ligne") {
    super(message);
    this.name = "OfflineError";
  }
}

/**
 * Jeton de la session ouverte dans ce navigateur, `null` sans session.
 * Lecture LOCALE (`getSession`, qui rafraîchit le jeton s'il a expiré), sans
 * aller-retour réseau par série. Ne décide d'aucun accès (la RLS le fait) :
 * il sert seulement à classer un échec. LÈVE `OfflineError` si le jeton doit
 * être rafraîchi et que le réseau manque (rejouable, pas une déconnexion).
 */
async function currentToken(supabase: BrowserSupabase): Promise<string | null> {
  const { data, error } = await supabase.auth.getSession();
  if (error && isAuthRetryableFetchError(error)) throw new OfflineError();
  return data.session?.access_token ?? null;
}

/**
 * Un refus (0 ligne, séance pas à moi) n'est DÉFINITIF que si la requête est
 * bien partie avec le jeton lu avant elle, toujours valable après. Sinon
 * (jeton rafraîchi ou perdu entre-temps), elle a pu partir en anonyme, où la
 * RLS ne laisse rien voir : session expirée, rejouable (règle CM-59 B).
 */
async function sameSessionStill(supabase: BrowserSupabase, token: string): Promise<boolean> {
  try {
    return (await currentToken(supabase)) === token;
  } catch {
    return false;
  }
}

/** Jeton refusé par PostgREST (expiré, horloge décalée) : à rejouer après reconnexion. */
function isJwtRejected(error: { code?: string | null }): boolean {
  return error.code === "PGRST301" || error.code === "PGRST303";
}

const EXPIRED: ActionResult = { ok: false, error: SESSION_EXPIRED_MESSAGE, expired: true };
const NOT_FOUND_REFUSED: ActionResult = { ok: false, error: "Séance introuvable", refused: true };

// ---------------------------------------------------------------------------
// Séries, une par une (CM-78), rejouées par `useSetPersistence`
// ---------------------------------------------------------------------------

export interface UpsertSetInput {
  id: string;
  sessionId: string;
  exerciseId: string;
  setIndex: number;
  weightKg: number;
  reps: number;
  isWarmup: boolean;
  rpe: number | null;
}

export interface DeleteSetInput {
  id: string;
  sessionId: string;
}

/**
 * Écrit une série. L'`id` vient toujours du client (`newSetId()`) : le réessai
 * est idempotent, le même `id` rejoue la même ligne.
 *
 * Un seul aller-retour dans le cas normal : l'upsert passe, ou la RLS le
 * refuse (42501). Seulement alors on regarde si la séance est à moi : elle
 * ne l'est pas (ou n'existe plus) → refus définitif ; elle l'est → jeton ou
 * grant en cause, rejouable (règle CM-59 B).
 */
export async function upsertSessionSet(
  supabase: BrowserSupabase,
  input: UpsertSetInput,
): Promise<ActionResult> {
  const reps = Math.round(input.reps);
  const setIndex = Math.round(input.setIndex);
  if (!input.id || !input.exerciseId) return { ok: false, error: "Série incomplète" };
  if (!Number.isFinite(input.weightKg) || input.weightKg < 0) {
    return { ok: false, error: "Poids invalide" };
  }
  if (!Number.isFinite(reps) || reps <= 0) return { ok: false, error: "Répétitions invalides" };
  if (!Number.isFinite(setIndex) || setIndex <= 0) {
    return { ok: false, error: "Numéro de série invalide" };
  }
  if (!input.sessionId) return NOT_FOUND_REFUSED;
  const token = await currentToken(supabase);
  if (!token) return EXPIRED;

  const { error } = await supabase.from("session_sets").upsert(
    {
      id: input.id,
      session_id: input.sessionId,
      exercise_id: input.exerciseId,
      set_index: setIndex,
      weight_kg: input.weightKg,
      reps,
      is_warmup: input.isWarmup,
      rpe: input.rpe,
    },
    { onConflict: "id" },
  );
  if (!error) return { ok: true };
  return classifyInsertError(supabase, error, input.sessionId, token);
}

/**
 * Échec d'un insert / upsert de série. 42501 : refus définitif seulement si
 * la séance n'est pas à moi, vérifié avec le même jeton ; sinon rejouable.
 */
async function classifyInsertError(
  supabase: BrowserSupabase,
  error: { code?: string | null; message: string },
  sessionId: string,
  token: string,
): Promise<ActionResult> {
  if (isJwtRejected(error)) return EXPIRED;
  if (
    isRlsDenied(error) &&
    (await sessionOwnership(supabase, sessionId)) === "notMine" &&
    (await sameSessionStill(supabase, token))
  ) {
    return NOT_FOUND_REFUSED;
  }
  return { ok: false, error: writeErrorMessage(error) };
}

/**
 * Supprime une série. 0 ligne touchée = déjà supprimée (réponse perdue d'un
 * réessai) ou pas à moi : rejouer ne sert à rien, refus définitif. La file ne
 * garde pas les suppressions refusées : aucune saisie n'est perdue.
 */
export async function deleteSessionSet(
  supabase: BrowserSupabase,
  input: DeleteSetInput,
): Promise<ActionResult> {
  if (!input.id) return { ok: false, error: "Série introuvable" };
  // Sans séance, la requête serait invalide (22P02) et rejouée sans fin.
  if (!input.sessionId) return NOT_FOUND_REFUSED;
  const token = await currentToken(supabase);
  if (!token) return EXPIRED;
  const { data, error } = await supabase
    .from("session_sets")
    .delete()
    .eq("id", input.id)
    .eq("session_id", input.sessionId)
    .select("id");
  if (error) return isJwtRejected(error) ? EXPIRED : { ok: false, error: writeErrorMessage(error) };
  if (!touchedRows(data)) {
    return (await sameSessionStill(supabase, token))
      ? { ok: false, error: REFUSED_MESSAGE, refused: true }
      : EXPIRED;
  }
  return { ok: true };
}

/**
 * La séance est-elle à l'utilisateur connecté ? Ne LÈVE pas, et ne répond
 * « notMine » que sur une preuve : session ouverte, lecture réussie, séance
 * absente ou à quelqu'un d'autre. Tout doute répond « unknown » (rejouable).
 */
async function sessionOwnership(
  supabase: BrowserSupabase,
  sessionId: string,
): Promise<"mine" | "notMine" | "unknown"> {
  try {
    const [{ data: auth, error: authError }, { data, error }] = await Promise.all([
      supabase.auth.getSession(),
      supabase
        .from("sessions")
        .select("id, profile_id")
        .eq("id", sessionId)
        .returns<{ id: string; profile_id: string }[]>()
        .maybeSingle(),
    ]);
    const userId = auth.session?.user.id;
    if (authError || error || !userId) return "unknown";
    return data && data.profile_id === userId ? "mine" : "notMine";
  } catch {
    return "unknown";
  }
}

// ---------------------------------------------------------------------------
// Clôture (logger, file `cm_pending_sessions`, bandeau de l'accueil)
// ---------------------------------------------------------------------------

export type LoggedSet = {
  exercise_id: string;
  set_index: number;
  weight_kg: number;
  reps: number;
  is_warmup: boolean;
};

export type FinishSessionInput = {
  sessionId: string;
  feedback: FeedbackValue | null;
  durationSeconds: number | null;
  notes?: string | null;
  /**
   * Rattrapage des séances mises de côté par l'ancienne version (CM-18) : leur
   * lot de séries n'a jamais été écrit, il vit encore dans `localStorage`.
   * Depuis CM-78 le client n'envoie plus jamais ce champ.
   */
  sets?: LoggedSet[];
};

export type FinishSessionResult = ActionResult;

/**
 * Marque une séance terminée (CM-78) : `duration_seconds` non nul est ce qui
 * distingue une séance terminée d'une séance en cours. Les séries sont déjà
 * en base.
 *
 * LÈVE `OfflineError` quand la requête n'aboutit pas : le logger range alors
 * la clôture dans la file hors ligne, `PendingSync` la rejoue.
 */
export async function finishSession(
  supabase: BrowserSupabase,
  input: FinishSessionInput,
): Promise<FinishSessionResult> {
  if (!input.sessionId) return NOT_FOUND_REFUSED;
  const token = await currentToken(supabase);
  if (!token) return EXPIRED;

  const legacySets = (input.sets ?? []).filter(
    (s) => s.reps > 0 && s.weight_kg >= 0 && Number.isFinite(s.weight_kg),
  );
  if (legacySets.length > 0) {
    // Séance en attente d'avant CM-78 : on n'insère que si la séance est
    // encore vide, pour ne jamais dupliquer des séries déjà écrites.
    const { count, error: countError } = await supabase
      .from("session_sets")
      .select("id", { count: "exact", head: true })
      .eq("session_id", input.sessionId);
    if (isTransportError(countError)) throw new OfflineError();
    if (countError) {
      return isJwtRejected(countError) ? EXPIRED : { ok: false, error: writeErrorMessage(countError) };
    }
    if ((count ?? 0) === 0) {
      const { error: insertError } = await supabase.from("session_sets").insert(
        legacySets.map((s) => ({
          session_id: input.sessionId,
          exercise_id: s.exercise_id,
          set_index: s.set_index,
          weight_kg: s.weight_kg,
          reps: s.reps,
          is_warmup: s.is_warmup,
        })),
      );
      if (isTransportError(insertError)) throw new OfflineError();
      if (insertError) return classifyInsertError(supabase, insertError, input.sessionId, token);
    }
  }

  // Sous RLS, un update hors de mes séances touche 0 ligne sans erreur :
  // séance inexistante ou pas à moi, refus définitif si la requête est bien
  // partie avec le jeton vérifié plus haut (sinon : session expirée).
  const { data: updated, error } = await supabase
    .from("sessions")
    .update({
      feedback: input.feedback,
      duration_seconds: input.durationSeconds,
      ...(input.notes === undefined ? {} : { notes: input.notes }),
    })
    .eq("id", input.sessionId)
    .select("id");
  if (isTransportError(error)) throw new OfflineError();
  if (error) return isJwtRejected(error) ? EXPIRED : { ok: false, error: writeErrorMessage(error) };
  if (!touchedRows(updated)) {
    return (await sameSessionStill(supabase, token))
      ? { ok: false, error: REFUSED_MESSAGE, refused: true }
      : EXPIRED;
  }
  return { ok: true };
}

/**
 * « Dernière fois » d'un exercice ajouté en cours de séance (CM-62). Même
 * logique que la lecture initiale de la séance, sur un seul exercice. `null`
 * si rien (ou lecture en échec : simple pré-remplissage).
 */
export async function fetchLastForExercise(
  supabase: BrowserSupabase,
  profileId: string,
  exerciseId: string,
  excludeSessionId: string,
): Promise<LastExerciseData | null> {
  const byExercise = await getLastSetsByExercise(supabase, profileId, [exerciseId], excludeSessionId);
  return byExercise[exerciseId] ?? null;
}

// ---------------------------------------------------------------------------
// Écritures d'écran : récap, bandeau « Séance en cours », abandon
// ---------------------------------------------------------------------------

const OFFLINE_TEXT = "Pas de connexion. Réessaie dans un instant.";

function screenError(prefix: string, error: { code?: string | null; message: string }): string {
  if (isTransportError(error)) return OFFLINE_TEXT;
  return `${prefix} : ${writeErrorMessage(error)}`;
}

/**
 * Supprime une de MES séances, séries comprises (`ON DELETE CASCADE`) : une
 * seule écriture, donc atomique. Sert le récap (« Supprimer »), le bandeau de
 * l'accueil et la feuille de sortie du logger (CM-94). Le filtre
 * `profile_id` double la RLS : la séance du partenaire, lisible, n'est
 * jamais supprimable.
 */
export async function deleteOwnSession(
  supabase: BrowserSupabase,
  profileId: string,
  sessionId: string,
): Promise<ScreenWriteResult> {
  if (!sessionId) return { ok: false, error: "Séance introuvable." };
  const { data, error } = await supabase
    .from("sessions")
    .delete()
    .eq("id", sessionId)
    .eq("profile_id", profileId)
    .select("id");
  if (error) return { ok: false, error: screenError("Impossible de supprimer la séance", error) };
  if (!touchedRows(data)) return { ok: false, error: "Séance introuvable." };
  return { ok: true };
}

/** Récap, « Corriger les séries » : poids et répétitions d'une série. */
export async function updateRecapSet(
  supabase: BrowserSupabase,
  input: { setId: string; sessionId: string; weightText: string; repsText: string },
): Promise<ScreenWriteResult> {
  const weight = Number(input.weightText.trim().replace(",", "."));
  const reps = Number(input.repsText.trim());
  if (!input.weightText.trim() || !Number.isFinite(weight) || weight < 0) {
    return { ok: false, error: "Poids invalide." };
  }
  if (!Number.isInteger(reps) || reps <= 0) return { ok: false, error: "Répétitions invalides." };

  const { data, error } = await supabase
    .from("session_sets")
    .update({ weight_kg: weight, reps })
    .eq("id", input.setId)
    .eq("session_id", input.sessionId)
    .select("id");
  if (error) return { ok: false, error: screenError("Série non modifiée", error) };
  if (!touchedRows(data)) return { ok: false, error: "Série introuvable." };
  return { ok: true };
}

/** Récap, « Corriger les séries » : suppression d'une série. */
export async function deleteRecapSet(
  supabase: BrowserSupabase,
  input: { setId: string; sessionId: string },
): Promise<ScreenWriteResult> {
  const { data, error } = await supabase
    .from("session_sets")
    .delete()
    .eq("id", input.setId)
    .eq("session_id", input.sessionId)
    .select("id");
  if (error) return { ok: false, error: screenError("Série non supprimée", error) };
  if (!touchedRows(data)) return { ok: false, error: "Série introuvable." };
  return { ok: true };
}

/**
 * Bandeau de l'accueil (CM-83) : clôture une séance oubliée sans la rouvrir.
 * La durée va de `performed_at` jusqu'à la DERNIÈRE série écrite, pas jusqu'à
 * maintenant : une séance d'hier soir clôturée ce matin ne vaut pas 15 h.
 *
 * Déjà terminée (deux onglets, double tap) : rien à faire, et surtout pas
 * écraser la durée réelle. L'update est conditionné à `duration_seconds is
 * null`, donc sans course possible.
 */
export async function closeStaleSession(
  supabase: BrowserSupabase,
  profileId: string,
  sessionId: string,
): Promise<ScreenWriteResult> {
  const prefix = "Impossible de terminer la séance";
  const [sessionRead, setsRead] = await Promise.all([
    supabase
      .from("sessions")
      .select("id, profile_id, performed_at, duration_seconds")
      .eq("id", sessionId)
      .returns<
        { id: string; profile_id: string; performed_at: string; duration_seconds: number | null }[]
      >()
      .maybeSingle(),
    supabase
      .from("session_sets")
      .select("created_at")
      .eq("session_id", sessionId)
      .returns<{ created_at: string }[]>(),
  ]);
  if (sessionRead.error) return { ok: false, error: screenError(prefix, sessionRead.error) };
  if (setsRead.error) return { ok: false, error: screenError(prefix, setsRead.error) };
  const session = sessionRead.data;
  if (!session || session.profile_id !== profileId) {
    return { ok: false, error: "Séance introuvable." };
  }
  if (session.duration_seconds !== null) return { ok: true };

  const duration = closingDurationSeconds(
    session.performed_at,
    (setsRead.data ?? []).map((s) => s.created_at),
  );
  if (duration === null) {
    return { ok: false, error: "Cette séance n'a aucune série à enregistrer." };
  }

  // 0 ligne : terminée entre-temps ailleurs (la séance est à moi, vérifié
  // ci-dessus). Rien à faire, pas une erreur.
  const { error } = await supabase
    .from("sessions")
    .update({ feedback: null, duration_seconds: duration })
    .eq("id", sessionId)
    .eq("profile_id", profileId)
    .is("duration_seconds", null)
    .select("id");
  if (error) return { ok: false, error: screenError(prefix, error) };
  return { ok: true };
}
