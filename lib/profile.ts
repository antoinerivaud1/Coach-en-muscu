import { cache } from "react";
import { redirect } from "next/navigation";
import { isUuid, resolveProfileId } from "@/lib/auth/core";
import { createAuthClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database";

export type Profile = {
  id: string;
  display_name: string;
  color_role: "toi" | "elle";
  weekly_goal: number;
};

export type AuthState = {
  /** Id du profil courant (= id Auth de la session), null si personne. */
  profileId: string | null;
};

/**
 * CM-58 : id de l'utilisateur de la session Supabase, JWT validé par
 * `getClaims()` (jamais `getSession()`). Null si pas de session ou erreur.
 */
async function readSessionUserId(): Promise<string | null> {
  try {
    const supabase = await createAuthClient();
    const { data, error } = await supabase.auth.getClaims();
    if (error || !data) return null;
    const sub = data.claims?.sub;
    return isUuid(sub) ? sub : null;
  } catch {
    return null;
  }
}

/**
 * État d'auth de la requête, mis en cache par requête (`cache`), donc un seul
 * `getClaims()` même si plusieurs appels. CM-59 B : seule la session compte.
 */
export const getAuthState = cache(async (): Promise<AuthState> => {
  const profileId = resolveProfileId(await readSessionUserId());
  return { profileId };
});

export async function getCurrentProfileId(): Promise<string | null> {
  return (await getAuthState()).profileId;
}

/** Renvoie l'id du profil courant, sinon redirige vers `/login`. */
export async function requireProfileId(): Promise<string> {
  const { profileId } = await getAuthState();
  if (!profileId) redirect("/login");
  return profileId;
}

export async function getProfile(
  supabase: SupabaseClient<Database>,
  id: string,
): Promise<Profile | null> {
  const { data } = await supabase
    .from("profiles")
    .select("id, display_name, color_role, weekly_goal")
    .eq("id", id)
    .returns<Profile[]>()
    .maybeSingle();
  return data;
}

/**
 * CM-85 : duo du profil (ex-couple, même uuid), null si le profil est solo.
 * Un profil appartient à un seul duo (index unique `duo_members.profile_id`).
 */
export async function getDuoId(
  supabase: SupabaseClient<Database>,
  profileId: string,
): Promise<string | null> {
  const { data } = await supabase
    .from("duo_members")
    .select("duo_id")
    .eq("profile_id", profileId)
    .returns<{ duo_id: string }[]>()
    .maybeSingle();
  return data?.duo_id ?? null;
}

/** CM-85 : profils membres du duo (2 au plus). */
export async function getDuoProfileIds(
  supabase: SupabaseClient<Database>,
  duoId: string,
): Promise<string[]> {
  const { data } = await supabase
    .from("duo_members")
    .select("profile_id")
    .eq("duo_id", duoId)
    .returns<{ profile_id: string }[]>();
  return (data ?? []).map((r) => r.profile_id);
}
