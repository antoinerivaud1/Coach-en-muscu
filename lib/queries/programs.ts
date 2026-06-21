import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database";

export async function getProgramsForUser(
  supabase: SupabaseClient<Database>,
  profileId: string,
  coupleId: string | null,
) {
  const query = supabase
    .from("programs")
    .select("id, name, couple_id, owner_profile_id, created_at, program_days(id)")
    .order("created_at", { ascending: false });

  if (coupleId) {
    return query.or(
      `owner_profile_id.eq.${profileId},couple_id.eq.${coupleId}`,
    );
  }

  return query.eq("owner_profile_id", profileId);
}

export type ProgramWithDays = {
  id: string;
  name: string;
  couple_id: string | null;
  owner_profile_id: string | null;
  created_at: string;
  program_days: { id: string }[];
};

// ---- Détail complet d'un programme (jours + exos) ----

export type ProgramExerciseFull = {
  id: string;
  exercise_id: string;
  target_sets: number;
  target_reps_min: number;
  target_reps_max: number;
  rest_seconds: number;
  order_index: number;
  exercises: {
    id: string;
    name: string;
    muscle_group: Database["public"]["Enums"]["muscle_group"];
  } | null;
};

export type ProgramDayFull = {
  id: string;
  name: string;
  order_index: number;
  weekdays: number[];
  program_exercises: ProgramExerciseFull[];
};

export type ProgramFull = {
  id: string;
  name: string;
  couple_id: string | null;
  owner_profile_id: string | null;
  program_days: ProgramDayFull[];
};

export async function getProgramWithDays(
  supabase: SupabaseClient<Database>,
  programId: string,
) {
  return supabase
    .from("programs")
    .select(
      `id, name, couple_id, owner_profile_id,
       program_days (
         id, name, order_index, weekdays,
         program_exercises (
           id, exercise_id, target_sets, target_reps_min, target_reps_max,
           rest_seconds, order_index,
           exercises ( id, name, muscle_group )
         )
       )`,
    )
    .eq("id", programId)
    .returns<ProgramFull[]>()
    .maybeSingle();
}

// ---- Un jour précis avec ses exercices (pour démarrer une séance) ----

export async function getDayWithExercises(
  supabase: SupabaseClient<Database>,
  dayId: string,
) {
  return supabase
    .from("program_days")
    .select(
      `id, name, order_index, weekdays,
       program_exercises (
         id, exercise_id, target_sets, target_reps_min, target_reps_max,
         rest_seconds, order_index,
         exercises ( id, name, muscle_group )
       )`,
    )
    .eq("id", dayId)
    .returns<ProgramDayFull[]>()
    .maybeSingle();
}
