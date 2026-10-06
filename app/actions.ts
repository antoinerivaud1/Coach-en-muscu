"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { PROFILE_COOKIE, getAuthState, getCurrentProfileId } from "@/lib/profile";
import { getAuthMode } from "@/lib/auth/mode";
import { createClient } from "@/lib/supabase/server";

export async function selectProfile(formData: FormData) {
  // CM-58 : en `required`, le sélecteur n'existe plus ; en `hybrid` avec une
  // session, la session prime et le cookie ne changerait rien.
  const { mode, source } = await getAuthState();
  if (mode === "required") redirect("/login");
  if (source === "session") redirect("/dashboard");
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
  // CM-58 : en `required`, plus de sélecteur (la déconnexion passe par signOut).
  redirect(getAuthMode() === "required" ? "/login" : "/");
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
