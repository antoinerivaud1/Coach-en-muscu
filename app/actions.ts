"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getCurrentProfileId } from "@/lib/profile";
import { createClient } from "@/lib/supabase/server";
import { REFUSED_MESSAGE, touchedRows, writeErrorMessage } from "@/lib/supabase/rlsErrors";

export async function updateWeeklyGoal(formData: FormData) {
  const goal = Math.min(14, Math.max(1, Number(formData.get("weekly_goal") ?? 4)));
  const profileId = await getCurrentProfileId();
  if (!profileId) redirect("/login");
  const supabase = await createClient();
  // CM-59 B : sous RLS, un update refusé touche 0 ligne sans erreur.
  const { data, error } = await supabase
    .from("profiles")
    .update({ weekly_goal: goal })
    .eq("id", profileId)
    .select("id");
  if (error || !touchedRows(data)) {
    const message = error ? writeErrorMessage(error) : REFUSED_MESSAGE;
    redirect(`/dashboard?error=${encodeURIComponent(`Objectif non enregistré : ${message}`)}`);
  }
  revalidatePath("/profile");
  revalidatePath("/progress");
}
