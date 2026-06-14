import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database";

export const PROFILE_COOKIE = "cm_profile";

export type Profile = {
  id: string;
  display_name: string;
  color_role: "toi" | "elle";
};

export async function getCurrentProfileId(): Promise<string | null> {
  const store = await cookies();
  return store.get(PROFILE_COOKIE)?.value ?? null;
}

/** Renvoie l'id du profil courant, ou redirige vers le sélecteur. */
export async function requireProfileId(): Promise<string> {
  const id = await getCurrentProfileId();
  if (!id) redirect("/");
  return id;
}

export async function getAllProfiles(
  supabase: SupabaseClient<Database>,
): Promise<Profile[]> {
  const { data } = await supabase
    .from("profiles")
    .select("id, display_name, color_role")
    .order("color_role")
    .returns<Profile[]>();
  return data ?? [];
}

export async function getProfile(
  supabase: SupabaseClient<Database>,
  id: string,
): Promise<Profile | null> {
  const { data } = await supabase
    .from("profiles")
    .select("id, display_name, color_role")
    .eq("id", id)
    .returns<Profile[]>()
    .maybeSingle();
  return data;
}

export async function getCoupleId(
  supabase: SupabaseClient<Database>,
  profileId: string,
): Promise<string | null> {
  const { data } = await supabase
    .from("couple_members")
    .select("couple_id")
    .eq("profile_id", profileId)
    .returns<{ couple_id: string }[]>()
    .maybeSingle();
  return data?.couple_id ?? null;
}

export async function getCoupleProfileIds(
  supabase: SupabaseClient<Database>,
  coupleId: string,
): Promise<string[]> {
  const { data } = await supabase
    .from("couple_members")
    .select("profile_id")
    .eq("couple_id", coupleId)
    .returns<{ profile_id: string }[]>();
  return (data ?? []).map((r) => r.profile_id);
}
