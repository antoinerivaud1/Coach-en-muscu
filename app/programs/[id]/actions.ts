"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function startSession(formData: FormData) {
  const dayId = String(formData.get("day_id") ?? "").trim();
  if (!dayId) {
    redirect("/dashboard");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  const { data: session, error } = await supabase
    .from("sessions")
    .insert({ profile_id: user.id, program_day_id: dayId })
    .select("id")
    .single();

  if (error || !session) {
    redirect(`/programs?error=${encodeURIComponent(error?.message ?? "Erreur")}`);
  }

  redirect(`/sessions/${session.id}`);
}
