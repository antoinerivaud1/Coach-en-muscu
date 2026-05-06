"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function createCoupleAction(formData: FormData) {
  const rawName = formData.get("couple_name");
  const coupleName =
    typeof rawName === "string" && rawName.trim() !== "" ? rawName.trim() : "";

  const supabase = await createClient();
  const { error } = await supabase.rpc("create_couple", {
    couple_name: coupleName,
  });

  if (error) {
    redirect(`/onboarding?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/", "layout");
  redirect("/dashboard");
}

export async function joinCoupleAction(formData: FormData) {
  const targetCoupleId = String(formData.get("couple_id") ?? "").trim();
  if (!targetCoupleId) {
    redirect("/onboarding?error=Code+couple+manquant");
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("join_couple", {
    target_couple_id: targetCoupleId,
  });

  if (error) {
    redirect(`/onboarding?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/", "layout");
  redirect("/dashboard");
}
