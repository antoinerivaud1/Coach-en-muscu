"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/types/database";

type Feedback = Database["public"]["Enums"]["session_feedback"];

export type LoggedSet = {
  exercise_id: string;
  set_index: number;
  weight_kg: number;
  reps: number;
};

export type FinishSessionInput = {
  sessionId: string;
  sets: LoggedSet[];
  feedback: Feedback | null;
  durationSeconds: number | null;
};

export type FinishSessionResult =
  | { success: true }
  | { success: false; error: string };

export async function finishSession(
  input: FinishSessionInput,
): Promise<FinishSessionResult> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { success: false, error: "Non authentifié" };
  }

  // Vérifie que la séance appartient bien à l'utilisateur.
  const { data: session, error: sessionError } = await supabase
    .from("sessions")
    .select("id, profile_id")
    .eq("id", input.sessionId)
    .maybeSingle();

  if (sessionError) {
    return { success: false, error: sessionError.message };
  }
  if (!session || session.profile_id !== user.id) {
    return { success: false, error: "Séance introuvable" };
  }

  // On remplace les séries existantes (permet la ré-édition).
  const { error: deleteError } = await supabase
    .from("session_sets")
    .delete()
    .eq("session_id", input.sessionId);

  if (deleteError) {
    return { success: false, error: deleteError.message };
  }

  const validSets = input.sets.filter(
    (s) => s.reps > 0 && s.weight_kg >= 0 && Number.isFinite(s.weight_kg),
  );

  if (validSets.length > 0) {
    const { error: insertError } = await supabase.from("session_sets").insert(
      validSets.map((s) => ({
        session_id: input.sessionId,
        exercise_id: s.exercise_id,
        set_index: s.set_index,
        weight_kg: s.weight_kg,
        reps: s.reps,
        is_warmup: false,
      })),
    );
    if (insertError) {
      return { success: false, error: insertError.message };
    }
  }

  const { error: updateError } = await supabase
    .from("sessions")
    .update({
      feedback: input.feedback,
      duration_seconds: input.durationSeconds,
    })
    .eq("id", input.sessionId);

  if (updateError) {
    return { success: false, error: updateError.message };
  }

  revalidatePath("/dashboard");
  revalidatePath("/history");
  revalidatePath("/progress");
  revalidatePath(`/sessions/${input.sessionId}`);
  return { success: true };
}

export async function deleteSession(formData: FormData) {
  const sessionId = String(formData.get("session_id") ?? "").trim();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !sessionId) return;

  await supabase
    .from("sessions")
    .delete()
    .eq("id", sessionId)
    .eq("profile_id", user.id);

  revalidatePath("/history");
  revalidatePath("/progress");
  redirect("/history");
}
