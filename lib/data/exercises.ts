import type { BrowserSupabase } from "@/lib/supabase/client";
import { catalogFilter, getCatalogExercises, type SystemExercise } from "@/lib/queries/exercises";
import { getDuoId, readDuoId } from "@/lib/queries/profiles";
import { libraryTarget } from "@/lib/duoMembership";
import { writeErrorMessage } from "@/lib/supabase/rlsErrors";
import type { MuscleGroup } from "@/lib/utils/seances";

/**
 * CM-88 : lectures et écritures des exercices côté client.
 *
 * Convention `lib/data/*` : fonctions sans React, qui prennent le client
 * navigateur en premier paramètre et réutilisent `lib/queries/*` (mêmes
 * requêtes que les pages serveur). Une lecture en échec LÈVE une erreur (le
 * hook affiche `ScreenError`), au lieu de renvoyer une liste vide qui se
 * confondrait avec « aucun exercice ».
 */

/** Catalogue visible par le profil : système, duo actif, exercices perso. */
export async function fetchCatalogExercises(
  supabase: BrowserSupabase,
  profileId: string,
): Promise<SystemExercise[]> {
  const duoId = await getDuoId(supabase, profileId);
  const { data, error } = await getCatalogExercises(supabase, duoId, profileId);
  if (error) throw new Error(error.message);
  return data ?? [];
}

export type CreateExerciseResult =
  | { ok: true; exercise: SystemExercise }
  | { ok: false; error: string };

/**
 * Crée un exercice perso (CM-13), depuis l'éditeur de séance type comme
 * depuis l'ajout d'exercice en séance (`CreateExerciseForm`) : exercice du
 * duo (`duo_id`) en duo actif, exercice perso à son nom (`owner_profile_id`,
 * CM-86) en solo. Une seule écriture, sous RLS. Remplace la server action
 * `createCustomExercise` (PR 5). Ne lève jamais.
 */
export async function createCustomExercise(
  supabase: BrowserSupabase,
  profileId: string,
  input: { name: string; muscle_group: MuscleGroup },
): Promise<CreateExerciseResult> {
  const name = input.name.trim();
  if (!name) {
    return { ok: false, error: "Le nom de l'exercice est requis" };
  }

  try {
    // C3 : duo illisible => refus (sinon l'exercice d'un membre du duo
    // deviendrait un exercice perso invisible pour l'autre).
    const target = libraryTarget(await readDuoId(supabase, profileId));
    if (target.kind === "error") {
      return { ok: false, error: target.error };
    }
    const duoId = target.kind === "shared" ? target.duoId : null;

    // Évite les doublons (catalogue système, mes exercices perso, ceux du duo).
    const { data: dupes } = await supabase
      .from("exercises")
      .select("id")
      .eq("name", name)
      .or(catalogFilter(duoId, profileId));
    if (dupes && dupes.length > 0) {
      return { ok: false, error: "Un exercice porte déjà ce nom" };
    }

    // Jamais les deux à la fois (contrainte `exercises_owner_or_duo`).
    const { data, error } = await supabase
      .from("exercises")
      .insert({
        name,
        muscle_group: input.muscle_group,
        is_compound: false,
        ...(duoId
          ? { duo_id: duoId, owner_profile_id: null }
          : { duo_id: null, owner_profile_id: profileId }),
      })
      .select("id, name, muscle_group, is_compound, duo_id, owner_profile_id")
      .returns<SystemExercise[]>()
      .single();

    if (error || !data) {
      return {
        ok: false,
        error: error ? writeErrorMessage(error) : "Erreur lors de la création de l'exercice",
      };
    }
    return { ok: true, exercise: data };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Erreur lors de la création de l'exercice",
    };
  }
}
