import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database";

export async function getSystemExercises(
  supabase: SupabaseClient<Database>,
) {
  return supabase
    .from("exercises")
    .select("id, name, muscle_group, is_compound")
    .is("couple_id", null)
    .order("muscle_group")
    .order("name");
}

export type SystemExercise = {
  id: string;
  name: string;
  muscle_group: Database["public"]["Enums"]["muscle_group"];
  is_compound: boolean;
};
