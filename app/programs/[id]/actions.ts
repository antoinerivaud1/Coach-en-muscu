"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireProfileId } from "@/lib/profile";

export async function startSession(formData: FormData) {
  const dayId = String(formData.get("day_id") ?? "").trim();
  if (!dayId) {
    redirect("/dashboard");
  }

  const profileId = await requireProfileId();
  const supabase = await createClient();

  const { data: session, error } = await supabase
    .from("sessions")
    .insert({ profile_id: profileId, program_day_id: dayId })
    .select("id")
    .single();

  if (error || !session) {
    redirect(`/dashboard?error=${encodeURIComponent(error?.message ?? "Erreur")}`);
  }

  redirect(`/sessions/${session.id}`);
}
