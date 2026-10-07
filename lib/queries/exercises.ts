import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database";

export type SystemExercise = {
  id: string;
  name: string;
  muscle_group: Database["public"]["Enums"]["muscle_group"];
  is_compound: boolean;
  duo_id: string | null;
};

/**
 * Catalogue affiché dans le builder: exercices système (`duo_id` null) +
 * exercices persos du duo (CM-85 : ex-couple, même uuid).
 */
export async function getCatalogExercises(
  supabase: SupabaseClient<Database>,
  duoId: string | null,
) {
  let query = supabase
    .from("exercises")
    .select("id, name, muscle_group, is_compound, duo_id")
    .order("muscle_group")
    .order("name");

  query = duoId
    ? query.or(`duo_id.is.null,duo_id.eq.${duoId}`)
    : query.is("duo_id", null);

  return query.returns<SystemExercise[]>();
}

/** Exercices système uniquement (duo_id null). */
export async function getSystemExercises(supabase: SupabaseClient<Database>) {
  return supabase
    .from("exercises")
    .select("id, name, muscle_group, is_compound, duo_id")
    .is("duo_id", null)
    .order("muscle_group")
    .order("name")
    .returns<SystemExercise[]>();
}
