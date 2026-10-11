import { cache } from "react";
import { redirect } from "next/navigation";
import { isUuid, loginPath, resolveProfileId } from "@/lib/auth/core";
import { createAuthClient } from "@/lib/supabase/server";

// CM-86 (C3) : lecture du duo qui distingue « solo » d'une erreur.
// CM-87 : `readDuoId` exporté ICI est celui du duo ACTIF (2 membres, voir
// plus bas) ; celui de lib/duoMembership.ts lit la ligne brute.
export {
  libraryTarget,
  DUO_READ_ERROR_MESSAGE,
  type DuoIdResult,
  type LibraryTarget,
} from "@/lib/duoMembership";
export type { DuoMembership } from "@/lib/duo";

// CM-88 : lectures déplacées dans lib/queries/profiles.ts (sans import serveur),
// réexportées ici pour les pages et actions serveur existantes.
export {
  getProfile,
  readDuoMembership,
  readDuoId,
  getDuoMembership,
  getDuoId,
  getDuoProfileIds,
  readMemberProfiles,
  getMemberProfiles,
  type Profile,
  type DuoMembershipRead,
  type MemberProfilesRead,
} from "@/lib/queries/profiles";

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

/**
 * Renvoie l'id du profil courant, sinon redirige vers `/login`, avec
 * `?next=<chemin>` quand la page appelante connaît son chemin (retour au même
 * écran après reconnexion).
 *
 * Jamais depuis une server action appelée par le logger de séance : la
 * redirection l'éjecterait. Celles-là lisent `getCurrentProfileId()` et
 * renvoient « Session expirée », rejouable.
 */
export async function requireProfileId(next?: string): Promise<string> {
  const { profileId } = await getAuthState();
  if (!profileId) redirect(loginPath(next));
  return profileId;
}
