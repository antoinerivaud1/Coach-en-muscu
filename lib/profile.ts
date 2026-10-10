import { cache } from "react";
import { redirect } from "next/navigation";
import { isUuid, loginPath, resolveProfileId } from "@/lib/auth/core";
import { createAuthClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database";
import { readDuoId as readDuoRow, type DuoIdResult } from "@/lib/duoMembership";
import { DUO_READ_ERROR_MESSAGE } from "@/lib/duoMembership";
import { activeMembership, type DuoMembership } from "@/lib/duo";

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

/**
 * CM-87 : la couleur d'un membre est `accent_color` (lue par `memberAccent`) ;
 * `color_role` n'est plus lue par le code (elle reste en base pour l'instant).
 */
export type Profile = {
  id: string;
  display_name: string;
  accent_color: string;
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

export async function getProfile(
  supabase: SupabaseClient<Database>,
  id: string,
): Promise<Profile | null> {
  const { data } = await supabase
    .from("profiles")
    .select("id, display_name, accent_color, weekly_goal")
    .eq("id", id)
    .returns<Profile[]>()
    .maybeSingle();
  return data;
}

export type DuoMembershipRead =
  | { ok: true; membership: DuoMembership | null }
  | { ok: false; error: string };

/**
 * Duo ACTIF du profil et son partenaire (CM-85, ex-couple, même uuid).
 *
 * CM-87 : un duo n'existe vraiment qu'à deux. Celui qu'une invitation en
 * attente a créé n'a qu'un membre : il est traité comme solo partout
 * (bibliothèque perso, exercices perso, aucune comparaison), sinon une
 * séance créée pendant l'attente irait dans une bibliothèque de duo vide.
 * Un profil appartient à un seul duo (index unique `duo_members.profile_id`).
 *
 * `{ ok: false }` si une lecture échoue (jamais confondu avec « solo »).
 */
export async function readDuoMembership(
  supabase: SupabaseClient<Database>,
  profileId: string,
): Promise<DuoMembershipRead> {
  const mine = await readDuoRow(supabase, profileId);
  if (!mine.ok) return { ok: false, error: mine.error };
  if (!mine.duoId) return { ok: true, membership: null };
  try {
    const { data: members, error } = await supabase
      .from("duo_members")
      .select("profile_id, joined_at")
      .eq("duo_id", mine.duoId)
      .returns<{ profile_id: string; joined_at: string }[]>();
    if (error) return { ok: false, error: error.message || DUO_READ_ERROR_MESSAGE };
    return { ok: true, membership: activeMembership(profileId, mine.duoId, members ?? []) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : DUO_READ_ERROR_MESSAGE };
  }
}

/**
 * Duo ACTIF pour décider d'une ÉCRITURE : `{ ok: true, duoId }` (null = solo
 * ou invitation en attente) ou `{ ok: false }`. À passer à `libraryTarget`.
 */
export async function readDuoId(
  supabase: SupabaseClient<Database>,
  profileId: string,
): Promise<DuoIdResult> {
  const read = await readDuoMembership(supabase, profileId);
  return read.ok
    ? { ok: true, duoId: read.membership?.duoId ?? null }
    : { ok: false, error: read.error };
}

/** Duo actif, AFFICHAGE seulement (null aussi sur erreur). */
export async function getDuoMembership(
  supabase: SupabaseClient<Database>,
  profileId: string,
): Promise<DuoMembership | null> {
  const read = await readDuoMembership(supabase, profileId);
  return read.ok ? read.membership : null;
}

/**
 * Id du duo actif, AFFICHAGE seulement : null pour un solo ET sur erreur
 * (CM-86, C3). Pour décider où écrire : `readDuoId` + `libraryTarget`.
 */
export async function getDuoId(
  supabase: SupabaseClient<Database>,
  profileId: string,
): Promise<string | null> {
  return (await getDuoMembership(supabase, profileId))?.duoId ?? null;
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

export type MemberProfilesRead =
  | { ok: true; duoId: string | null; profiles: Profile[] }
  | { ok: false; error: string };

/**
 * CM-87 : profils visibles pour les écrans de comparaison (moi, plus mon
 * partenaire si je suis en duo actif), avec prénom et couleur de membre.
 * `ok: false` si le duo n'a pas pu être lu. Un profil illisible ne fait pas
 * échouer la lecture (le duo reste connu, cf. `toMembers`).
 */
export async function readMemberProfiles(
  supabase: SupabaseClient<Database>,
  profileId: string,
): Promise<MemberProfilesRead> {
  const read = await readDuoMembership(supabase, profileId);
  if (!read.ok) return read;
  const membership = read.membership;
  const ids = membership ? [profileId, membership.partnerId] : [profileId];
  const { data } = await supabase
    .from("profiles")
    .select("id, display_name, accent_color, weekly_goal")
    .in("id", ids)
    .returns<Profile[]>();
  return {
    ok: true,
    duoId: membership?.duoId ?? null,
    profiles: membership
      ? withPartnerPlaceholder(data ?? [], membership.partnerId)
      : (data ?? []),
  };
}

/** Partenaire illisible : une ligne neutre, le duo reste affiché (C6). */
function withPartnerPlaceholder(profiles: Profile[], partnerId: string): Profile[] {
  if (profiles.some((p) => p.id === partnerId)) return profiles;
  return [...profiles, { id: partnerId, display_name: "", accent_color: "", weekly_goal: 3 }];
}

/** AFFICHAGE seulement : en cas d'erreur, moi seul (aucune comparaison). */
export async function getMemberProfiles(
  supabase: SupabaseClient<Database>,
  profileId: string,
): Promise<{ duoId: string | null; profiles: Profile[] }> {
  const read = await readMemberProfiles(supabase, profileId);
  if (read.ok) return { duoId: read.duoId, profiles: read.profiles };
  const me = await getProfile(supabase, profileId);
  return { duoId: null, profiles: me ? [me] : [] };
}
