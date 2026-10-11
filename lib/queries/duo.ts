import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database";
import { createAuthClient } from "@/lib/supabase/server";
import { readDuoState, type DuoState } from "@/lib/queries/duoState";

/**
 * CM-87 : lectures du duo optionnel.
 *
 * Les RPC du duo (security definer) lisent l'appelant dans `auth.uid()` : elles
 * passent TOUJOURS par le client utilisateur (`createAuthClient`), même avec le
 * filet `DATA_CLIENT=service`, dont la clé service-role n'a pas d'utilisateur.
 * Elles font elles-mêmes leurs contrôles d'appartenance.
 */
export async function duoRpcClient() {
  return createAuthClient();
}

// CM-88 : état du duo déplacé dans lib/queries/duoState.ts (sans import
// serveur), réexporté ici pour les pages serveur.
export type { DuoState, PendingInvitation } from "@/lib/queries/duoState";

/** État du duo pour les pages serveur : RPC avec le client utilisateur. */
export async function getDuoState(
  supabase: SupabaseClient<Database>,
  profileId: string,
): Promise<DuoState> {
  return readDuoState(supabase, await duoRpcClient(), profileId);
}

export type InvitationPreview = {
  inviterName: string;
  inviterColor: string;
  expiresAt: string;
  myColor: string;
  colorConflict: boolean;
  alreadyInDuo: boolean;
};

/**
 * Aperçu d'une invitation pour l'écran de confirmation, ou message d'erreur brut.
 * CM-102 : un code inconnu, expiré, révoqué ou déjà utilisé ne lève plus
 * d'erreur (l'échec est compté en base) : aucune ligne. Trop d'échecs :
 * `cm102:too_many_attempts`. Cet aperçu est aussi exigé avant
 * `accept_duo_invitation`.
 */
export async function previewInvitation(
  code: string,
): Promise<{ ok: true; preview: InvitationPreview } | { ok: false; error: string }> {
  const rpc = await duoRpcClient();
  const { data, error } = await rpc.rpc("get_duo_invitation", { p_code: code });
  if (error) return { ok: false, error: error.message };
  const row = data?.[0];
  if (!row) return { ok: false, error: "cm87:invitation_invalid" };
  return {
    ok: true,
    preview: {
      inviterName: row.inviter_name,
      inviterColor: row.inviter_color,
      expiresAt: row.expires_at,
      myColor: row.my_color,
      colorConflict: row.color_conflict,
      alreadyInDuo: row.already_in_duo,
    },
  };
}
