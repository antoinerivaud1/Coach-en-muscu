"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireProfileId, getCoupleId } from "@/lib/profile";
import type { Database } from "@/lib/types/database";

type ExerciseInput = {
  exercise_id: string;
  target_sets: number;
  target_reps_min: number;
  target_reps_max: number;
  rest_seconds: number;
  order_index: number;
};

type ProgramDayInput = {
  name: string;
  exercises: ExerciseInput[];
};

export type CreateProgramInput = {
  name: string;
  scope: "individual" | "couple";
  days: ProgramDayInput[];
};

export type CreateProgramResult =
  | { success: true; programId: string }
  | { success: false; error: string };

export async function createProgram(
  input: CreateProgramInput,
): Promise<CreateProgramResult> {
  const profileId = await requireProfileId();
  const supabase = await createClient();

  const coupleId = await getCoupleId(supabase, profileId);

  if (input.scope === "couple" && !coupleId) {
    return {
      success: false,
      error: "Tu dois être en couple pour créer un programme partagé",
    };
  }

  const programInsert =
    input.scope === "couple"
      ? { name: input.name, couple_id: coupleId, owner_profile_id: null }
      : { name: input.name, couple_id: null, owner_profile_id: profileId };

  const { data: program, error: programError } = await supabase
    .from("programs")
    .insert(programInsert)
    .select("id")
    .single();

  if (programError || !program) {
    return {
      success: false,
      error: programError?.message ?? "Erreur lors de la création du programme",
    };
  }

  for (let i = 0; i < input.days.length; i++) {
    const day = input.days[i];

    const { data: dayData, error: dayError } = await supabase
      .from("program_days")
      .insert({ program_id: program.id, name: day.name, order_index: i })
      .select("id")
      .single();

    if (dayError || !dayData) {
      return {
        success: false,
        error: dayError?.message ?? "Erreur lors de la création du jour",
      };
    }

    for (const exercise of day.exercises) {
      const { error: exError } = await supabase
        .from("program_exercises")
        .insert({
          program_day_id: dayData.id,
          exercise_id: exercise.exercise_id,
          target_sets: exercise.target_sets,
          target_reps_min: exercise.target_reps_min,
          target_reps_max: exercise.target_reps_max,
          rest_seconds: exercise.rest_seconds,
          order_index: exercise.order_index,
        });

      if (exError) {
        return { success: false, error: exError.message };
      }
    }
  }

  revalidatePath("/dashboard");
  return { success: true, programId: program.id };
}

type MuscleGroup = Database["public"]["Enums"]["muscle_group"];

export type CreateExerciseResult =
  | {
      success: true;
      exercise: {
        id: string;
        name: string;
        muscle_group: MuscleGroup;
        is_compound: boolean;
        couple_id: string | null;
      };
    }
  | { success: false; error: string };

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

  const coupleId = await getCoupleId(supabase, profileId);
  if (!coupleId) {
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
    .or(`couple_id.is.null,couple_id.eq.${coupleId}`);
  if (dupes && dupes.length > 0) {
    return { success: false, error: "Un exercice porte déjà ce nom" };
  }

  const { data, error } = await supabase
    .from("exercises")
    .insert({
      name,
      muscle_group: input.muscle_group,
      is_compound: false,
      couple_id: coupleId,
    })
    .select("id, name, muscle_group, is_compound, couple_id")
    .single();

  if (error || !data) {
    return {
      success: false,
      error: error?.message ?? "Erreur lors de la création de l'exercice",
    };
  }

  revalidatePath("/programs/new");
  return { success: true, exercise: data };
}
