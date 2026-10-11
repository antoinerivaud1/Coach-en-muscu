import type { BrowserSupabase } from "@/lib/supabase/client";
import { getCatalogExercises, type SystemExercise } from "@/lib/queries/exercises";
import { getDuoId } from "@/lib/queries/profiles";

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
