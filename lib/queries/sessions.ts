import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database";

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

  let query = supabase
    .from("session_sets")
    .select(
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
};

export async function getSessionSets(
  supabase: SupabaseClient<Database>,
  sessionId: string,
) {
  return supabase
    .from("session_sets")
    .select("id, exercise_id, set_index, weight_kg, reps, is_warmup")
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
  return supabase
    .from("sessions")
    .select(
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
  return supabase
    .from("session_sets")
    .select(
      "exercise_id, weight_kg, reps, session_id, sessions!inner ( performed_at )",
    )
    .eq("sessions.profile_id", profileId)
    .eq("is_warmup", false)
    .returns<ProgressRow[]>();
}
