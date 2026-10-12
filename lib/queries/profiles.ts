import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database";
import { readDuoId as readDuoRow, type DuoIdResult } from "@/lib/duoMembership";
import { DUO_READ_ERROR_MESSAGE } from "@/lib/duoMembership";
import { activeMembership, type DuoMembership } from "@/lib/duo";

// CM-88 : lectures du profil et du duo qui prennent le client Supabase en
// paramètre. Aucun import Next ni serveur : appelées par les écrans client
// (client navigateur, sous RLS) via lib/data/*.

/**
 * CM-87 : la couleur d'un membre est `accent_color` (lue par `memberAccent`).
 * CM-103 : l'ancien `color_role` n'est plus lu nulle part (colonne supprimée
 * après déploiement, migration 20261011120000).
 */
export type Profile = {
  id: string;
  display_name: string;
  accent_color: string;
  weekly_goal: number;
};

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
