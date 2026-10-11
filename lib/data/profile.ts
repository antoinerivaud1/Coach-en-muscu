import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database";
import type { BrowserSupabase } from "@/lib/supabase/client";
import { readIdentity, readPartnerColor, type Identity } from "@/lib/queries/identity";
import { readDuoState, type DuoState } from "@/lib/queries/duoState";
import { getBadges, type Badge } from "@/lib/badges";
import { partnerColorConflict } from "@/lib/members";
import {
  validateIdentityInput,
  type IdentityFieldErrors,
  type IdentityInput,
} from "@/lib/onboarding";
import { REFUSED_MESSAGE, touchedRows, writeErrorMessage } from "@/lib/supabase/rlsErrors";

/**
 * CM-88 : lectures et écritures de l'écran Profil côté client (convention
 * `lib/data/*` : client navigateur en premier paramètre, une lecture en échec
 * LÈVE, les écritures renvoient `{ ok }`).
 */

/** Identité du profil (prénom, couleur, objectif), null si le profil n'existe pas. */
export async function fetchIdentity(
  supabase: BrowserSupabase,
  profileId: string,
): Promise<Identity | null> {
  const read = await readIdentity(supabase, profileId);
  if (!read.ok) throw new Error(`Lecture du profil impossible : ${read.error}`);
  return read.identity;
}

/**
 * Badges calculés à partir des séances terminées. Même calcul que l'ancienne
 * page serveur (`getBadges`, inchangé) : une lecture des séances en échec
 * compte zéro séance, comme avant.
 */
export async function fetchBadges(
  supabase: BrowserSupabase,
  profileId: string,
  weeklyGoal: number,
): Promise<{ badges: Badge[]; earnedCount: number }> {
  const { badges, earnedCount } = await getBadges(supabase, profileId, weeklyGoal);
  return { badges, earnedCount };
}

/**
 * État du duo. Dans le navigateur, le même client porte la session pour les
 * lectures et pour les RPC du duo. Une lecture en échec donne `{ kind:
 * "error" }` (carte « Réessayer »), jamais « solo ».
 */
export async function fetchDuoState(
  supabase: BrowserSupabase,
  profileId: string,
): Promise<DuoState> {
  return readDuoState(supabase, supabase, profileId);
}

export type IdentityWriteResult =
  | { ok: true }
  | { ok: false; error?: string; fieldErrors?: IdentityFieldErrors };

/**
 * CM-86 / CM-103 : écrit prénom, couleur et objectif. La couleur du
 * partenaire de duo actif est refusée ici, pas seulement grisée à l'écran.
 * Sans import serveur : partagée par le Profil (client navigateur) et
 * l'onboarding (server action, client serveur).
 */
export async function writeIdentity(
  supabase: SupabaseClient<Database>,
  profileId: string,
  value: IdentityInput,
): Promise<IdentityWriteResult> {
  const partner = await readPartnerColor(supabase, profileId);
  if (!partner.ok) return { ok: false, error: partner.error };
  const conflict = partnerColorConflict(value.accentColor, partner.partner);
  if (conflict) return { ok: false, fieldErrors: { accentColor: conflict } };

  // CM-59 B : sous RLS, un update refusé touche 0 ligne sans erreur.
  const { data, error } = await supabase
    .from("profiles")
    .update({
      display_name: value.displayName,
      accent_color: value.accentColor,
      weekly_goal: value.weeklyGoal,
    })
    .eq("id", profileId)
    .select("id");
  if (error) return { ok: false, error: writeErrorMessage(error) };
  if (!touchedRows(data)) return { ok: false, error: REFUSED_MESSAGE };
  return { ok: true };
}

/** Profil, section « Mon profil » : valeurs saisies (texte brut du formulaire). */
export async function updateIdentity(
  supabase: BrowserSupabase,
  profileId: string,
  values: { displayName: string; accentColor: string; weeklyGoal: string },
): Promise<IdentityWriteResult> {
  const parsed = validateIdentityInput(values);
  if (!parsed.ok) return { ok: false, fieldErrors: parsed.errors };
  try {
    return await writeIdentity(supabase, profileId, parsed.value);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Enregistrement impossible" };
  }
}
