"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

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
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) {
    return { success: false, error: "Non authentifié" };
  }

  const { data: memberData, error: memberError } = await supabase
    .from("couple_members")
    .select("couple_id")
    .eq("profile_id", user.id)
    .maybeSingle();

  if (memberError) {
    return { success: false, error: memberError.message };
  }

  const coupleId = memberData?.couple_id ?? null;

  if (input.scope === "couple" && !coupleId) {
    return {
      success: false,
      error: "Tu dois être en couple pour créer un programme partagé",
    };
  }

  const programInsert =
    input.scope === "couple"
      ? { name: input.name, couple_id: coupleId, owner_profile_id: null }
      : { name: input.name, couple_id: null, owner_profile_id: user.id };

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
