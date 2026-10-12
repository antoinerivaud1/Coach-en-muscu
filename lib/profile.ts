import { cache } from "react";
import { isUuid, resolveProfileId } from "@/lib/auth/core";
import { createAuthClient } from "@/lib/supabase/server";

// CM-88 (PR 8) : ne garde que l'état d'auth de la requête (redirection de
// `/`, app/route.ts). Les lectures de profil et de duo sont dans
// lib/queries/profiles.ts, appelées depuis le navigateur (lib/data/*).

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
