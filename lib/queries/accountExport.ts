import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database";
import type {
  AccountExportData,
  ExportExercise,
  ExportProfile,
  ExportProgram,
  ExportSession,
} from "@/lib/export/accountExport";

/**
 * CM-60 : lecture des données à exporter, avec le client des pages
 * (`createClient`, sous RLS ; service-role avec le filet DATA_CLIENT=service).
 *
 * Seulement les données de `profileId`, filtrées EXPLICITEMENT dans chaque
 * requête : la RLS laisse voir les séances du partenaire de duo et la
 * bibliothèque du duo, qui ne lui appartiennent pas (et le filet contourne la
 * RLS). Le partenaire n'apparaît jamais dans l'export.
 */

const PAGE = 500;

type SessionRow = {
  id: string;
  performed_at: string;
  duration_seconds: number | null;
  feedback: string | null;
  notes: string | null;
  created_at: string;
  program_days: { name: string } | null;
  session_sets: {
    id: string;
    set_index: number;
    weight_kg: number | string;
    reps: number;
    rpe: number | string | null;
    is_warmup: boolean;
    created_at: string;
    exercise_id: string;
    exercises: { name: string } | null;
  }[];
};

type ProgramRow = {
  id: string;
  name: string;
  created_at: string;
  program_days: {
    id: string;
    name: string;
    order_index: number;
    program_exercises: {
      order_index: number;
      exercise_id: string;
      target_sets: number;
      target_reps_min: number;
      target_reps_max: number;
      rest_seconds: number;
      notes: string | null;
      exercises: { name: string } | null;
    }[];
  }[];
};

async function readSessions(
  supabase: SupabaseClient<Database>,
  profileId: string,
): Promise<ExportSession[]> {
  const rows: SessionRow[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("sessions")
      .select(
        "id, performed_at, duration_seconds, feedback, notes, created_at, program_days (name), session_sets (id, set_index, weight_kg, reps, rpe, is_warmup, created_at, exercise_id, exercises (name))",
      )
      .eq("profile_id", profileId)
      .order("performed_at", { ascending: true })
      .order("id", { ascending: true })
      .range(from, from + PAGE - 1)
      .returns<SessionRow[]>();
    if (error) throw new Error(error.message);
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE) break;
  }
  return rows.map((s) => ({
    id: s.id,
    performed_at: s.performed_at,
    duration_seconds: s.duration_seconds,
    feedback: s.feedback,
    notes: s.notes,
    created_at: s.created_at,
    seance_name: s.program_days?.name ?? null,
    sets: (s.session_sets ?? []).map((x) => ({
      id: x.id,
      set_index: x.set_index,
      weight_kg: x.weight_kg,
      reps: x.reps,
      rpe: x.rpe,
      is_warmup: x.is_warmup,
      created_at: x.created_at,
      exercise_id: x.exercise_id,
      exercise_name: x.exercises?.name ?? null,
    })),
  }));
}

async function readPrograms(
  supabase: SupabaseClient<Database>,
  profileId: string,
): Promise<ExportProgram[]> {
  const { data, error } = await supabase
    .from("programs")
    .select(
      "id, name, created_at, program_days (id, name, order_index, program_exercises (order_index, exercise_id, target_sets, target_reps_min, target_reps_max, rest_seconds, notes, exercises (name)))",
    )
    .eq("owner_profile_id", profileId)
    .order("created_at", { ascending: true })
    .returns<ProgramRow[]>();
  if (error) throw new Error(error.message);
  return (data ?? []).map((p) => ({
    id: p.id,
    name: p.name,
    created_at: p.created_at,
    days: (p.program_days ?? []).map((d) => ({
      id: d.id,
      name: d.name,
      order_index: d.order_index,
      exercises: (d.program_exercises ?? []).map((e) => ({
        order_index: e.order_index,
        exercise_id: e.exercise_id,
        exercise_name: e.exercises?.name ?? null,
        target_sets: e.target_sets,
        target_reps_min: e.target_reps_min,
        target_reps_max: e.target_reps_max,
        rest_seconds: e.rest_seconds,
        notes: e.notes,
      })),
    })),
  }));
}

async function readExercises(
  supabase: SupabaseClient<Database>,
  profileId: string,
): Promise<ExportExercise[]> {
  const { data, error } = await supabase
    .from("exercises")
    .select("id, name, muscle_group, is_compound, created_at")
    .eq("owner_profile_id", profileId)
    .order("created_at", { ascending: true })
    .returns<ExportExercise[]>();
  if (error) throw new Error(error.message);
  return data ?? [];
}

async function readProfile(
  supabase: SupabaseClient<Database>,
  profileId: string,
): Promise<ExportProfile | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select("display_name, accent_color, weekly_goal, avatar_url, created_at, onboarded_at")
    .eq("id", profileId)
    .returns<ExportProfile[]>()
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

/** Toutes les données du compte `profileId`. Lève une erreur si une lecture échoue. */
export async function readAccountExport(
  supabase: SupabaseClient<Database>,
  profileId: string,
  email: string | null,
): Promise<AccountExportData> {
  const [profile, programs, sessions, exercises] = await Promise.all([
    readProfile(supabase, profileId),
    readPrograms(supabase, profileId),
    readSessions(supabase, profileId),
    readExercises(supabase, profileId),
  ]);
  return { email, profile, programs, sessions, exercises };
}
