"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireProfileId, getDuoId } from "@/lib/profile";
import { writeErrorMessage } from "@/lib/supabase/rlsErrors";
import { catalogFilter } from "@/lib/queries/exercises";
import type { Database } from "@/lib/types/database";

type MuscleGroup = Database["public"]["Enums"]["muscle_group"];

export type CreateExerciseResult =
  | {
      success: true;
      exercise: {
        id: string;
        name: string;
        muscle_group: MuscleGroup;
        is_compound: boolean;
        duo_id: string | null;
        owner_profile_id: string | null;
      };
    }
  | { success: false; error: string };

/**
 * Crée un exercice perso (CM-13) : exercice du duo (`duo_id`) quand
 * l'utilisateur est en duo, exercice perso à son nom (`owner_profile_id`,
 * CM-86) quand il s'entraîne seul.
 *
 * Vit dans `lib/actions/` depuis CM-81 : l'action était rattachée à l'ancien
 * builder de programme, supprimé avec lui, alors qu'elle est appelée depuis
 * deux écrans (`CreateExerciseForm`, réutilisé par la création de séance et par
 * l'ajout d'exercice en cours de séance).
 */
export async function createCustomExercise(input: {
  name: string;
  muscle_group: MuscleGroup;
}): Promise<CreateExerciseResult> {
  const profileId = await requireProfileId();
  const supabase = await createClient();

  const name = input.name.trim();
  if (!name) {
    return { success: false, error: "Le nom de l'exercice est requis" };
  }

  const duoId = await getDuoId(supabase, profileId);

  // Évite les doublons (catalogue système, mes exercices perso, ceux du duo).
  const { data: dupes } = await supabase
    .from("exercises")
    .select("id")
    .eq("name", name)
    .or(catalogFilter(duoId, profileId));
  if (dupes && dupes.length > 0) {
    return { success: false, error: "Un exercice porte déjà ce nom" };
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
    .single();

  if (error || !data) {
    return {
      success: false,
      error: error
        ? writeErrorMessage(error)
        : "Erreur lors de la création de l'exercice",
    };
  }

  revalidatePath("/seances/new");
  revalidatePath("/guide");
  return { success: true, exercise: data };
}
