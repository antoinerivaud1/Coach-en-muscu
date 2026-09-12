import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database";
import type { MuscleGroup } from "@/lib/utils/seances";
import { ABANDONED_EMPTY_SESSION_MS } from "@/lib/utils/currentSession";

// ─────────────────────────────────────────────────────────────────────────────
// Critère UNIQUE de « séance terminée » (CM-83)
//
// Depuis CM-78 les séries sont écrites une par une, à leur validation : « la
// séance a des séries » ne veut donc plus dire « la séance est terminée ». Une
// séance en cours a des `session_sets` dès la première série validée, et tout
// écran qui filtrait sur « a des séries » la comptait comme terminée —
// historique, stats, strip hebdo, « dernière fois », records, badges.
//
// Le seul marqueur de fin est `duration_seconds` : null = en cours, renseigné =
// terminée. C'est déjà ce que la page séance utilise depuis CM-78. Toute lecture
// d'historique, de statistique ou de compteur passe par un des deux
// constructeurs ci-dessous — jamais par une condition recopiée à la main.
//
// Deux exceptions volontaires, qui doivent VOIR les séances en cours :
//   - l'indicateur « partenaire en séance » de l'accueil (CM-53) ;
//   - le bandeau de reprise de l'accueil (`getCurrentSession`, CM-83).
// Le récap d'une séance (`/sessions/[id]`) n'est pas concerné : il lit une
// séance précise par son id.
// ─────────────────────────────────────────────────────────────────────────────

/** La colonne, et elle seule, qui marque la fin d'une séance. */
const COMPLETED_MARKER = "duration_seconds";

/** La même colonne, vue depuis une requête qui part de `session_sets`. */
const JOINED_COMPLETED_MARKER = `sessions.${COMPLETED_MARKER}` as const;

/**
 * Requête sur `sessions` restreinte aux séances TERMINÉES. L'appelant ajoute
 * son propre périmètre (`profile_id`, fenêtre de dates, tri) et son
 * `.returns<T[]>()`.
 */
export function completedSessionsQuery<Columns extends string>(
  supabase: SupabaseClient<Database>,
  columns: Columns,
) {
  return supabase.from("sessions").select(columns).not(COMPLETED_MARKER, "is", null);
}

/**
 * Requête sur `session_sets` restreinte aux séries des séances TERMINÉES. Le
 * `sessions!inner (...)` du `select` est obligatoire pour que le filtre porte.
 */
export function completedSessionSetsQuery<Columns extends string>(
  supabase: SupabaseClient<Database>,
  columns: Columns,
) {
  return supabase
    .from("session_sets")
    .select(columns)
    .not(JOINED_COMPLETED_MARKER, "is", null);
}

type SetRow = {
  set_index: number;
  weight_kg: number;
  reps: number;
};

export type LastExerciseData = {
  performed_at: string;
  sets: SetRow[];
};

type LastSetJoinRow = {
  exercise_id: string;
  set_index: number;
  weight_kg: number;
  reps: number;
  session_id: string;
  sessions: { performed_at: string; profile_id: string } | null;
};

/**
 * Pour chaque exercice, renvoie les séries de la séance la plus récente
 * (hors séance courante) de ce profil. C'est le "besoin n°1": savoir
 * combien on a levé la dernière fois.
 */
export async function getLastSetsByExercise(
  supabase: SupabaseClient<Database>,
  profileId: string,
  exerciseIds: string[],
  excludeSessionId?: string,
): Promise<Record<string, LastExerciseData>> {
  if (exerciseIds.length === 0) return {};

  let query = completedSessionSetsQuery(
    supabase,
    "exercise_id, set_index, weight_kg, reps, session_id, sessions!inner ( performed_at, profile_id )",
  )
    .eq("sessions.profile_id", profileId)
    .eq("is_warmup", false)
    .in("exercise_id", exerciseIds);

  if (excludeSessionId) {
    query = query.neq("session_id", excludeSessionId);
  }

  const { data, error } = await query.returns<LastSetJoinRow[]>();
  if (error || !data) return {};

  // Pour chaque exercice: trouver la session la plus récente, garder ses séries.
  const latestSessionByExercise: Record<
    string,
    { sessionId: string; performedAt: string }
  > = {};

  for (const row of data) {
    const performedAt = row.sessions?.performed_at;
    if (!performedAt) continue;
    const current = latestSessionByExercise[row.exercise_id];
    if (!current || performedAt > current.performedAt) {
      latestSessionByExercise[row.exercise_id] = {
        sessionId: row.session_id,
        performedAt,
      };
    }
  }

  const result: Record<string, LastExerciseData> = {};
  for (const row of data) {
    const latest = latestSessionByExercise[row.exercise_id];
    if (!latest || row.session_id !== latest.sessionId) continue;
    const entry =
      result[row.exercise_id] ??
      (result[row.exercise_id] = {
        performed_at: latest.performedAt,
        sets: [],
      });
    entry.sets.push({
      set_index: row.set_index,
      weight_kg: row.weight_kg,
      reps: row.reps,
    });
  }

  for (const ex of Object.keys(result)) {
    result[ex]!.sets.sort((a, b) => a.set_index - b.set_index);
  }

  return result;
}

// ---- Détail d'une séance (pour saisie ou récap) ----

export type SessionRow = {
  id: string;
  profile_id: string;
  program_day_id: string | null;
  performed_at: string;
  duration_seconds: number | null;
  feedback: Database["public"]["Enums"]["session_feedback"] | null;
  notes: string | null;
};

export async function getSession(
  supabase: SupabaseClient<Database>,
  sessionId: string,
) {
  return supabase
    .from("sessions")
    .select(
      "id, profile_id, program_day_id, performed_at, duration_seconds, feedback, notes",
    )
    .eq("id", sessionId)
    .returns<SessionRow[]>()
    .maybeSingle();
}

export type SessionSetRow = {
  id: string;
  exercise_id: string;
  set_index: number;
  weight_kg: number;
  reps: number;
  is_warmup: boolean;
  /** Ordre d'apparition des exercices hors programme au rechargement (CM-62). */
  created_at: string;
};

export async function getSessionSets(
  supabase: SupabaseClient<Database>,
  sessionId: string,
) {
  return supabase
    .from("session_sets")
    .select("id, exercise_id, set_index, weight_kg, reps, is_warmup, created_at")
    .eq("session_id", sessionId)
    .order("set_index")
    .returns<SessionSetRow[]>();
}

// ---- Historique des séances ----

export type HistorySessionRow = {
  id: string;
  profile_id: string;
  performed_at: string;
  duration_seconds: number | null;
  feedback: Database["public"]["Enums"]["session_feedback"] | null;
  program_days: { name: string } | null;
  session_sets: { id: string }[];
};

export async function getHistory(
  supabase: SupabaseClient<Database>,
  profileIds: string[],
) {
  return completedSessionsQuery(
    supabase,
    "id, profile_id, performed_at, duration_seconds, feedback, program_days ( name ), session_sets ( id )",
  )
    .in("profile_id", profileIds)
    .order("performed_at", { ascending: false })
    .returns<HistorySessionRow[]>();
}

// ---- Données de progression (toutes les séries d'un profil) ----

export type ProgressRow = {
  exercise_id: string;
  weight_kg: number;
  reps: number;
  session_id: string;
  sessions: { performed_at: string } | null;
};

export async function getAllSetsForProgress(
  supabase: SupabaseClient<Database>,
  profileId: string,
) {
  return completedSessionSetsQuery(
    supabase,
    "exercise_id, weight_kg, reps, session_id, sessions!inner ( performed_at )",
  )
    .eq("sessions.profile_id", profileId)
    .eq("is_warmup", false)
    .returns<ProgressRow[]>();
}

// ---- Séances terminées de l'accueil (strip hebdo, « dernière fois », suggestion) ----

export type DashboardSessionRow = {
  id: string;
  performed_at: string;
  program_day_id: string | null;
  session_sets: { id: string; exercises: { muscle_group: MuscleGroup } | null }[];
};

/**
 * Séances terminées du profil, du plus récent au plus ancien.
 *
 * Le `.eq("profile_id", …)` est OBLIGATOIRE : le client serveur est en clé
 * service, la RLS n'isole donc pas les deux profils du couple (CM-17).
 */
export async function getCompletedSessionsForDashboard(
  supabase: SupabaseClient<Database>,
  profileId: string,
) {
  return completedSessionsQuery(
    supabase,
    "id, performed_at, program_day_id, session_sets ( id, exercises ( muscle_group ) )",
  )
    .eq("profile_id", profileId)
    .order("performed_at", { ascending: false })
    .returns<DashboardSessionRow[]>();
}

// ---- Séances terminées d'une fenêtre de dates (objectif hebdo, comparaison couple) ----

export type WeekSessionRow = {
  id: string;
  profile_id: string;
  performed_at: string;
};

export async function getCompletedSessionsSince(
  supabase: SupabaseClient<Database>,
  profileIds: string[],
  sinceIso: string,
) {
  return completedSessionsQuery(supabase, "id, profile_id, performed_at")
    .in("profile_id", profileIds)
    .gte("performed_at", sinceIso)
    .returns<WeekSessionRow[]>();
}

// ---- Séances terminées d'un profil (badges) ----

export type CompletedSessionRow = {
  id: string;
  performed_at: string;
};

export async function getCompletedSessions(
  supabase: SupabaseClient<Database>,
  profileId: string,
) {
  return completedSessionsQuery(supabase, "id, performed_at")
    .eq("profile_id", profileId)
    .returns<CompletedSessionRow[]>();
}

// ─────────────────────────────────────────────────────────────────────────────
// Séance EN COURS (bandeau de reprise de l'accueil, CM-83)
//
// Seule lecture, avec l'indicateur « partenaire en séance », à ne PAS filtrer
// sur `duration_seconds` : c'est précisément une séance non terminée qu'on
// cherche.
// ─────────────────────────────────────────────────────────────────────────────

export type CurrentSessionRow = {
  id: string;
  performed_at: string;
  program_days: { name: string } | null;
  /** `created_at` de chaque série déjà écrite : compteur + clôture différée. */
  session_sets: { created_at: string }[];
};

/** La séance en cours la plus récente du profil, s'il en a une. */
export async function getCurrentSession(
  supabase: SupabaseClient<Database>,
  profileId: string,
): Promise<CurrentSessionRow | null> {
  const { data } = await supabase
    .from("sessions")
    .select("id, performed_at, program_days ( name ), session_sets ( created_at )")
    .eq("profile_id", profileId)
    .is(COMPLETED_MARKER, null)
    .order("performed_at", { ascending: false })
    .limit(1)
    .returns<CurrentSessionRow[]>();

  return data?.[0] ?? null;
}

/**
 * Nettoyage opportuniste des séances abandonnées (CM-83).
 *
 * Une séance démarrée par erreur (un tap sur une carte, puis retour) reste « en
 * cours » pour toujours : rien ne la termine. Sans aucune série et passé
 * `ABANDONED_EMPTY_SESSION_MS`, elle ne contient aucune donnée et ne sera jamais
 * reprise — on la supprime.
 *
 * Volontairement déclenché au chargement de l'accueil, pas par un cron ni un
 * job : il n'y a rien à planifier pour deux utilisateurs, et l'opération est
 * idempotente (elle ne cible que des lignes vides du profil courant, donc rien
 * à la deuxième exécution). Une séance QUI A DES SÉRIES n'est jamais supprimée
 * automatiquement, même très ancienne : elle contient du travail réel.
 */
export async function purgeAbandonedEmptySessions(
  supabase: SupabaseClient<Database>,
  profileId: string,
  now: Date,
): Promise<void> {
  const before = new Date(now.getTime() - ABANDONED_EMPTY_SESSION_MS).toISOString();

  const { data } = await supabase
    .from("sessions")
    .select("id, session_sets ( id )")
    .eq("profile_id", profileId)
    .is(COMPLETED_MARKER, null)
    .lt("performed_at", before)
    .returns<{ id: string; session_sets: { id: string }[] }[]>();

  const emptyIds = (data ?? [])
    .filter((s) => (s.session_sets ?? []).length === 0)
    .map((s) => s.id);
  if (emptyIds.length === 0) return;

  // Le `.eq("profile_id", …)` est redondant avec le `select` ci-dessus, et
  // gardé : une suppression ne doit jamais pouvoir sortir du profil courant.
  await supabase
    .from("sessions")
    .delete()
    .in("id", emptyIds)
    .eq("profile_id", profileId);
}
