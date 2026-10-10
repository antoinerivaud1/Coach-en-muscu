import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database";

export type SystemExercise = {
  id: string;
  name: string;
  muscle_group: Database["public"]["Enums"]["muscle_group"];
  is_compound: boolean;
  duo_id: string | null;
  /** CM-86 : exercice perso d'un utilisateur (null pour le système et le duo). */
  owner_profile_id: string | null;
};

/** Exercice créé par l'utilisateur ou son duo (pas de fiche technique). */
export function isCustomExercise(ex: {
  duo_id: string | null;
  owner_profile_id?: string | null;
}): boolean {
  return ex.duo_id !== null || (ex.owner_profile_id ?? null) !== null;
}

/**
 * Filtre PostgREST (`or`) du catalogue visible : exercices système (`duo_id`
 * et `owner_profile_id` null), exercices perso du profil (CM-86,
 * `owner_profile_id`) et exercices du duo (CM-85). Explicite pour que le filet
 * DATA_CLIENT=service, qui contourne la RLS, ne montre jamais l'exercice perso
 * d'un autre compte. Ids interpolés : toujours des uuid de la session ou de la
 * base, jamais une saisie.
 */
export function catalogFilter(duoId: string | null, profileId?: string | null): string {
  const branches = ["and(duo_id.is.null,owner_profile_id.is.null)"];
  if (profileId) branches.push(`owner_profile_id.eq.${profileId}`);
  if (duoId) branches.push(`duo_id.eq.${duoId}`);
  return branches.join(",");
}

/**
 * Catalogue affiché dans le builder, l'ajout en séance et le guide : exercices
 * système + exercices perso de `profileId` (CM-86) + exercices du duo.
 * Sans `profileId`, les exercices perso ne remontent pas.
 */
export async function getCatalogExercises(
  supabase: SupabaseClient<Database>,
  duoId: string | null,
  profileId?: string | null,
) {
  return supabase
    .from("exercises")
    .select("id, name, muscle_group, is_compound, duo_id, owner_profile_id")
    .or(catalogFilter(duoId, profileId))
    .order("muscle_group")
    .order("name")
    .returns<SystemExercise[]>();
}

/** Exercices système uniquement (duo_id et owner_profile_id null). */
export async function getSystemExercises(supabase: SupabaseClient<Database>) {
  return supabase
    .from("exercises")
    .select("id, name, muscle_group, is_compound, duo_id, owner_profile_id")
    .is("duo_id", null)
    .is("owner_profile_id", null)
    .order("muscle_group")
    .order("name")
    .returns<SystemExercise[]>();
}
