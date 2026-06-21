"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
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

export async function setDayWeekdays(formData: FormData) {
  const dayId = String(formData.get("day_id") ?? "").trim();
  const programId = String(formData.get("program_id") ?? "").trim();
  if (!dayId) redirect("/dashboard");
  await requireProfileId();
  const supabase = await createClient();
  const weekdays = formData
    .getAll("wd")
    .map((v) => Number(v))
    .filter((n) => Number.isInteger(n) && n >= 0 && n <= 6);
  await supabase.from("program_days").update({ weekdays }).eq("id", dayId);
  revalidatePath(`/programs/${programId}`);
  revalidatePath("/dashboard");
}

export async function deleteProgram(formData: FormData) {
  const programId = String(formData.get("program_id") ?? "").trim();
  if (!programId) {
    redirect("/dashboard");
  }
  await requireProfileId();
  const supabase = await createClient();

  await supabase.from("programs").delete().eq("id", programId);

  revalidatePath("/dashboard");
  redirect("/dashboard");
}
