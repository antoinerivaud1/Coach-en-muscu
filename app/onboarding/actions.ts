"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

type CreateCoupleArgs = { couple_name: string };
type JoinCoupleArgs = { target_couple_id: string };

export async function createCoupleAction(formData: FormData) {
  const rawName = formData.get("couple_name");
  const coupleName =
    typeof rawName === "string" && rawName.trim() !== "" ? rawName.trim() : "";

  const supabase = await createClient();
  const args: CreateCoupleArgs = { couple_name: coupleName };
  const { error } = await supabase.rpc("create_couple", args);

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
  const args: JoinCoupleArgs = { target_couple_id: targetCoupleId };
  const { error } = await supabase.rpc("join_couple", args);

  if (error) {
    redirect(`/onboarding?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/", "layout");
  redirect("/dashboard");
}
