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

export type IdentityRead =
  | { ok: true; identity: Identity | null }
  | { ok: false; error: string };

/** Lecture qui distingue « pas de profil » d'une erreur (CM-86, C7). */
export async function readIdentity(
  supabase: SupabaseClient<Database>,
  profileId: string,
): Promise<IdentityRead> {
  try {
    const { data, error } = await supabase
      .from("profiles")
      .select("id, display_name, accent_color, color_role, weekly_goal, avatar_url, onboarded_at")
      .eq("id", profileId)
      .returns<Identity[]>()
      .maybeSingle();
    if (error) return { ok: false, error: error.message };
    return { ok: true, identity: data };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Lecture impossible" };
  }
}

/** Identité du profil, null si absente OU illisible (affichage seulement). */
export async function getIdentity(
  supabase: SupabaseClient<Database>,
  profileId: string,
): Promise<Identity | null> {
  const read = await readIdentity(supabase, profileId);
  return read.ok ? read.identity : null;
}
