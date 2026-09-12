"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireProfileId, getCurrentProfileId } from "@/lib/profile";
import { getLastSetsByExercise } from "@/lib/queries/sessions";
import type { LastExerciseData } from "@/lib/queries/sessions";
import type { Database } from "@/lib/types/database";

type Feedback = Database["public"]["Enums"]["session_feedback"];

export type LoggedSet = {
  exercise_id: string;
  set_index: number;
  weight_kg: number;
  reps: number;
  is_warmup: boolean;
};

export type FinishSessionInput = {
  sessionId: string;
  feedback: Feedback | null;
  durationSeconds: number | null;
  notes?: string | null;
  /**
   * Rattrapage des séances mises de côté par l'ancienne version (CM-18) : leur
   * lot de séries n'a jamais été écrit, il vit encore dans `localStorage`.
   * Depuis CM-78 le client n'envoie plus jamais ce champ, les séries partent
   * une par une au moment de leur validation.
   */
  sets?: LoggedSet[];
};

export type FinishSessionResult =
  | { ok: true }
  | { ok: false; error: string };

/**
 * Clôture d'une séance (CM-78).
 *
 * N'écrit plus aucune série : elles sont déjà en base, écrites une par une à
 * leur validation (`lib/actions/sessionSets.ts`). Cette action ne fait que
 * marquer la séance terminée — `duration_seconds` non nul est précisément ce
 * qui distingue une séance terminée d'une séance en cours.
 */
export async function finishSession(
  input: FinishSessionInput,
): Promise<FinishSessionResult> {
  const profileId = await requireProfileId();
  const supabase = await createClient();

  // Vérifie que la séance appartient bien au profil courant.
  const { data: session, error: sessionError } = await supabase
    .from("sessions")
    .select("id, profile_id")
    .eq("id", input.sessionId)
    .returns<{ id: string; profile_id: string }[]>()
    .maybeSingle();

  if (sessionError) {
    return { ok: false, error: sessionError.message };
  }
  if (!session || session.profile_id !== profileId) {
    return { ok: false, error: "Séance introuvable" };
  }

  const legacySets = (input.sets ?? []).filter(
    (s) => s.reps > 0 && s.weight_kg >= 0 && Number.isFinite(s.weight_kg),
  );
  if (legacySets.length > 0) {
    // Une séance en attente d'avant CM-78 : on n'insère que si la séance est
    // encore vide, pour ne jamais dupliquer des séries déjà écrites par la file.
    const { count } = await supabase
      .from("session_sets")
      .select("id", { count: "exact", head: true })
      .eq("session_id", input.sessionId);

    if ((count ?? 0) === 0) {
      const { error: insertError } = await supabase.from("session_sets").insert(
        legacySets.map((s) => ({
          session_id: input.sessionId,
          exercise_id: s.exercise_id,
          set_index: s.set_index,
          weight_kg: s.weight_kg,
          reps: s.reps,
          is_warmup: s.is_warmup,
        })),
      );
      if (insertError) {
        return { ok: false, error: insertError.message };
      }
    }
  }

  const { error: updateError } = await supabase
    .from("sessions")
    .update({
      feedback: input.feedback,
      duration_seconds: input.durationSeconds,
      ...(input.notes === undefined ? {} : { notes: input.notes }),
    })
    .eq("id", input.sessionId);

  if (updateError) {
    return { ok: false, error: updateError.message };
  }

  revalidatePath("/dashboard");
  revalidatePath("/history");
  revalidatePath("/progress");
  revalidatePath(`/sessions/${input.sessionId}`);
  return { ok: true };
}

/**
 * « Dernière fois » d'un exercice ajouté en cours de séance (CM-62).
 *
 * Même logique que le chargement serveur de la séance, sur un seul exercice :
 * l'exercice n'étant pas au programme, son historique n'a pas pu être chargé
 * au rendu initial. Passe par le serveur, donc aucune requête Supabase côté
 * client.
 */
export async function fetchLastForExercise(
  exerciseId: string,
  excludeSessionId: string,
): Promise<LastExerciseData | null> {
  const profileId = await requireProfileId();
  const supabase = await createClient();
  const byExercise = await getLastSetsByExercise(
    supabase,
    profileId,
    [exerciseId],
    excludeSessionId,
  );
  return byExercise[exerciseId] ?? null;
}

export async function deleteSession(formData: FormData) {
  const sessionId = String(formData.get("session_id") ?? "").trim();
  const profileId = await getCurrentProfileId();
  const supabase = await createClient();
  if (!profileId || !sessionId) return;

  await supabase
    .from("sessions")
    .delete()
    .eq("id", sessionId)
    .eq("profile_id", profileId);

  revalidatePath("/history");
  revalidatePath("/progress");
  redirect("/history");
}

export async function updateSet(formData: FormData) {
  const setId = String(formData.get("set_id") ?? "").trim();
  const sessionId = String(formData.get("session_id") ?? "").trim();
  const weight = Number(String(formData.get("weight") ?? "0").replace(",", "."));
  const reps = parseInt(String(formData.get("reps") ?? "0"), 10);
  const profileId = await getCurrentProfileId();
  const supabase = await createClient();
  if (profileId && setId && Number.isFinite(weight) && Number.isFinite(reps) && reps > 0) {
    await supabase
      .from("session_sets")
      .update({ weight_kg: weight, reps })
      .eq("id", setId);
  }
  revalidatePath(`/sessions/${sessionId}`);
  revalidatePath("/progress");
  redirect(`/sessions/${sessionId}?editsets=1`);
}

export async function deleteSet(formData: FormData) {
  const setId = String(formData.get("set_id") ?? "").trim();
  const sessionId = String(formData.get("session_id") ?? "").trim();
  const profileId = await getCurrentProfileId();
  const supabase = await createClient();
  if (profileId && setId) {
    await supabase.from("session_sets").delete().eq("id", setId);
  }
  revalidatePath(`/sessions/${sessionId}`);
  revalidatePath("/progress");
  redirect(`/sessions/${sessionId}?editsets=1`);
}
