import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database";
import { createAuthClient } from "@/lib/supabase/server";
import { readDuoMembership } from "@/lib/profile";

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

export type PendingInvitation = { code: string; expiresAt: string };

export type DuoState =
  | { kind: "error" }
  | { kind: "solo" }
  | { kind: "pending"; invitation: PendingInvitation }
  | {
      kind: "duo";
      duoId: string;
      since: string;
      partner: { id: string; display_name: string; accent_color: string };
    };

/** Invitation en attente de mon duo (non expirée), null sinon. */
export async function getMyPendingInvitation(): Promise<PendingInvitation | null> {
  const rpc = await duoRpcClient();
  const { data, error } = await rpc.rpc("get_my_duo_invitation");
  const row = !error ? data?.[0] : undefined;
  return row ? { code: row.code, expiresAt: row.expires_at } : null;
}

/** État du duo pour la carte du Profil : solo, invitation en attente, en duo. */
export async function getDuoState(
  supabase: SupabaseClient<Database>,
  profileId: string,
): Promise<DuoState> {
  const read = await readDuoMembership(supabase, profileId);
  // Lecture en échec : jamais présentée comme « solo » (C3).
  if (!read.ok) return { kind: "error" };
  const membership = read.membership;
  if (membership) {
    const { data: partner } = await supabase
      .from("profiles")
      .select("id, display_name, accent_color")
      .eq("id", membership.partnerId)
      .returns<{ id: string; display_name: string; accent_color: string }[]>()
      .maybeSingle();
    return {
      kind: "duo",
      duoId: membership.duoId,
      since: membership.since,
      partner: partner ?? {
        id: membership.partnerId,
        display_name: "Partenaire",
        accent_color: "",
      },
    };
  }
  const invitation = await getMyPendingInvitation();
  return invitation ? { kind: "pending", invitation } : { kind: "solo" };
}

export type InvitationPreview = {
  inviterName: string;
  inviterColor: string;
  expiresAt: string;
  myColor: string;
  colorConflict: boolean;
  alreadyInDuo: boolean;
};

/** Aperçu d'une invitation pour l'écran de confirmation, ou message d'erreur brut. */
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
