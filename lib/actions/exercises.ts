"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireProfileId, getDuoId } from "@/lib/profile";
import { writeErrorMessage } from "@/lib/supabase/rlsErrors";
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
      };
    }
  | { success: false; error: string };

/**
 * Crée un exercice perso du couple (CM-13).
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
  if (!duoId) {
    return {
      success: false,
      error: "Tu dois être en couple pour créer un exercice perso",
    };
  }

  // Évite les doublons (catalogue système ou exercices du couple).
  const { data: dupes } = await supabase
    .from("exercises")
    .select("id")
    .eq("name", name)
    .or(`and(duo_id.is.null,owner_profile_id.is.null),duo_id.eq.${duoId}`);
  if (dupes && dupes.length > 0) {
    return { success: false, error: "Un exercice porte déjà ce nom" };
  }

  const { data, error } = await supabase
    .from("exercises")
    .insert({
      name,
      muscle_group: input.muscle_group,
      is_compound: false,
      duo_id: duoId,
    })
    .select("id, name, muscle_group, is_compound, duo_id")
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
  return { success: true, exercise: data };
}
