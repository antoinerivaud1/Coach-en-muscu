import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database";
import { readDuoMembership } from "@/lib/queries/profiles";

/**
 * CM-87 : état du duo (carte du Profil, écran d'invitation). CM-88 : logique
 * sans import serveur, partagée par les pages serveur (`lib/queries/duo.ts`,
 * qui passe le client utilisateur pour les RPC) et les écrans client (le
 * client navigateur sert aux deux).
 *
 * Les RPC du duo (security definer) lisent l'appelant dans `auth.uid()` :
 * `rpc` doit TOUJOURS être un client porteur de la session de l'utilisateur.
 */

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
export async function readPendingInvitation(
  rpc: SupabaseClient<Database>,
): Promise<PendingInvitation | null> {
  const { data, error } = await rpc.rpc("get_my_duo_invitation");
  const row = !error ? data?.[0] : undefined;
  return row ? { code: row.code, expiresAt: row.expires_at } : null;
}

/** État du duo : solo, invitation en attente, en duo, ou lecture en échec. */
export async function readDuoState(
  supabase: SupabaseClient<Database>,
  rpc: SupabaseClient<Database>,
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
  const invitation = await readPendingInvitation(rpc);
  return invitation ? { kind: "pending", invitation } : { kind: "solo" };
}
