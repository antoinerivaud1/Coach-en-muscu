import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { isUuid, resolveProfileId, type AuthMode, type ProfileSource } from "@/lib/auth/core";
import { getAuthMode } from "@/lib/auth/mode";
import { createAuthClient } from "@/lib/supabase/auth-server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database";

export const PROFILE_COOKIE = "cm_profile";

export type Profile = {
  id: string;
  display_name: string;
  color_role: "toi" | "elle";
  weekly_goal: number;
};

export type AuthState = {
  mode: AuthMode;
  /** Id du profil courant (= id Auth si session), null si personne. */
  profileId: string | null;
  /** D'où vient `profileId` : session Supabase, cookie `cm_profile`, ou rien. */
  source: ProfileSource;
  /** Utilisateur de la session Supabase validée (`claims.sub`), si présente. */
  sessionUserId: string | null;
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
 * CM-58 : état d'auth de la requête, mis en cache par requête (`cache`), donc
 * un seul `getClaims()` même si plusieurs appels. En mode `cookie`, aucun
 * appel Supabase : comportement historique strict.
 */
export const getAuthState = cache(async (): Promise<AuthState> => {
  const mode = getAuthMode();
  const store = await cookies();
  const cookieProfileId = store.get(PROFILE_COOKIE)?.value ?? null;
  const sessionUserId = mode === "cookie" ? null : await readSessionUserId();
  const { profileId, source } = resolveProfileId({ mode, sessionUserId, cookieProfileId });
  return { mode, profileId, source, sessionUserId };
});

export async function getCurrentProfileId(): Promise<string | null> {
  return (await getAuthState()).profileId;
}

/**
 * Renvoie l'id du profil courant, sinon redirige : vers le sélecteur (modes
 * `cookie` et `hybrid`) ou vers `/login` (mode `required`, CM-58).
 */
export async function requireProfileId(): Promise<string> {
  const { profileId, mode } = await getAuthState();
  if (!profileId) redirect(mode === "required" ? "/login" : "/");
  return profileId;
}

export async function getAllProfiles(
  supabase: SupabaseClient<Database>,
): Promise<Profile[]> {
  const { data } = await supabase
    .from("profiles")
    .select("id, display_name, color_role, weekly_goal")
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
    .select("id, display_name, color_role, weekly_goal")
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
