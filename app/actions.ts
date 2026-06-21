"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { PROFILE_COOKIE, getCurrentProfileId } from "@/lib/profile";
import { createClient } from "@/lib/supabase/server";

export async function selectProfile(formData: FormData) {
  const id = String(formData.get("profile_id") ?? "").trim();
  if (!id) redirect("/");
  const store = await cookies();
  store.set(PROFILE_COOKIE, id, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });
  revalidatePath("/", "layout");
  redirect("/dashboard");
}

export async function clearProfile() {
  const store = await cookies();
  store.delete(PROFILE_COOKIE);
  revalidatePath("/", "layout");
  redirect("/");
}

export async function updateWeeklyGoal(formData: FormData) {
  const goal = Math.min(14, Math.max(1, Number(formData.get("weekly_goal") ?? 4)));
  const profileId = await getCurrentProfileId();
  if (!profileId) redirect("/");
  const supabase = await createClient();
  await supabase.from("profiles").update({ weekly_goal: goal }).eq("id", profileId);
  revalidatePath("/profile");
  revalidatePath("/progress");
}
