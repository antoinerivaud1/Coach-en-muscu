import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database";

/**
 * CM-86 : identité d'un profil telle que l'onboarding et la section « Mon
 * profil » la manipulent (prénom, couleur de membre, objectif, onboarding).
 * Distincte de `getProfile` (lib/profile.ts), que le reste de l'app lit.
 */
export type Identity = {
  id: string;
  display_name: string;
  accent_color: string;
  color_role: "toi" | "elle";
  weekly_goal: number;
  avatar_url: string | null;
  onboarded_at: string | null;
};

export async function getIdentity(
  supabase: SupabaseClient<Database>,
  profileId: string,
): Promise<Identity | null> {
  const { data } = await supabase
    .from("profiles")
    .select("id, display_name, accent_color, color_role, weekly_goal, avatar_url, onboarded_at")
    .eq("id", profileId)
    .returns<Identity[]>()
    .maybeSingle();
  return data;
}
