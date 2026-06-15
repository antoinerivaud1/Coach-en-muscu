import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database";

export type SystemExercise = {
  id: string;
  name: string;
  muscle_group: Database["public"]["Enums"]["muscle_group"];
  is_compound: boolean;
  couple_id: string | null;
};

/** Catalogue affiché dans le builder: exercices système + exercices persos du couple. */
export async function getCatalogExercises(
  supabase: SupabaseClient<Database>,
  coupleId: string | null,
) {
  let query = supabase
    .from("exercises")
    .select("id, name, muscle_group, is_compound, couple_id")
    .order("muscle_group")
    .order("name");

  query = coupleId
    ? query.or(`couple_id.is.null,couple_id.eq.${coupleId}`)
    : query.is("couple_id", null);

  return query.returns<SystemExercise[]>();
}

/** Exercices système uniquement (couple_id null). */
export async function getSystemExercises(supabase: SupabaseClient<Database>) {
  return supabase
    .from("exercises")
    .select("id, name, muscle_group, is_compound, couple_id")
    .is("couple_id", null)
    .order("muscle_group")
    .order("name")
    .returns<SystemExercise[]>();
}
