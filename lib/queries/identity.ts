import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database";
import type { PartnerColor } from "@/lib/members";
import { DUO_READ_ERROR_MESSAGE } from "@/lib/duoMembership";
import { readDuoMembership } from "@/lib/queries/profiles";

/**
 * CM-86 : identité d'un profil telle que l'onboarding et la section « Mon
 * profil » la manipulent (prénom, couleur de membre, objectif, onboarding).
 * Distincte de `getProfile` (lib/queries/profiles.ts), que le reste de l'app
 * lit. CM-89 (PR 1) : `onboarded_at` y est aussi lu par `OnboardingGate`.
 */
export type Identity = {
  id: string;
  display_name: string;
  accent_color: string;
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
      .select("id, display_name, accent_color, weekly_goal, avatar_url, onboarded_at")
      .eq("id", profileId)
      .returns<Identity[]>()
      .maybeSingle();
    if (error) return { ok: false, error: error.message };
    return { ok: true, identity: data };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Lecture impossible" };
  }
}

export type PartnerColorRead =
  | { ok: true; partner: PartnerColor | null }
  | { ok: false; error: string };

/**
 * CM-103 : prénom et couleur du partenaire de duo ACTIF (données du duo :
 * `readDuoMembership`, puis son profil), pour refuser sa couleur. Solo, ou
 * invitation encore en attente : `partner` null (aucune restriction). Une
 * lecture du duo en échec n'est jamais prise pour « solo » (C3) : erreur.
 */
export async function readPartnerColor(
  supabase: SupabaseClient<Database>,
  profileId: string,
): Promise<PartnerColorRead> {
  const read = await readDuoMembership(supabase, profileId);
  if (!read.ok) return { ok: false, error: DUO_READ_ERROR_MESSAGE };
  if (!read.membership) return { ok: true, partner: null };
  try {
    const { data, error } = await supabase
      .from("profiles")
      .select("display_name, accent_color")
      .eq("id", read.membership.partnerId)
      .returns<{ display_name: string; accent_color: string }[]>()
      .maybeSingle();
    if (error) return { ok: false, error: DUO_READ_ERROR_MESSAGE };
    return {
      ok: true,
      partner: data ? { name: data.display_name, color: data.accent_color } : null,
    };
  } catch {
    return { ok: false, error: DUO_READ_ERROR_MESSAGE };
  }
}
