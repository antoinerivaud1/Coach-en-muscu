import type { BrowserSupabase } from "@/lib/supabase/client";
import {
  duoErrorCode,
  duoErrorMessage,
  isValidInviteCode,
  normalizeInviteCode,
  type DuoErrorCode,
} from "@/lib/duo";
import { isMemberColor } from "@/lib/members";

/**
 * CM-87 / CM-88 (PR 7) : actions et aperçu du duo, depuis le navigateur.
 *
 * Toutes passent par les RPC security definer de CM-87 / CM-102
 * (supabase/migrations/20261010191000_cm87_duo_rpc.sql et
 * 20261011110000_cm102_invitation_rate_limit.sql) : aucune écriture directe
 * sur duos, duo_members ni duo_invitations. Les RPC lisent l'appelant dans
 * `auth.uid()` : le client navigateur porte la session de l'utilisateur.
 *
 * Écritures : `{ ok: true } | { ok: false; error }` (message en français,
 * jamais de détail technique). Aperçu : refus métier renvoyé, erreur
 * inattendue (réseau) LEVÉE pour que l'écran propose « Réessayer ».
 */

export type DuoWriteResult = { ok: true } | { ok: false; error: string };

type RpcError = { message: string } | null;

async function callRpc(run: () => PromiseLike<{ error: RpcError }>): Promise<DuoWriteResult> {
  try {
    const { error } = await run();
    if (error) return { ok: false, error: duoErrorMessage(error.message) };
    return { ok: true };
  } catch {
    return { ok: false, error: duoErrorMessage(null) };
  }
}

/** « Inviter mon partenaire » : crée (ou remplace) l'invitation. */
export function createDuoInvitation(supabase: BrowserSupabase): Promise<DuoWriteResult> {
  return callRpc(() => supabase.rpc("create_duo_invitation"));
}

/** « Annuler l'invitation » : retour au solo. */
export function revokeDuoInvitation(supabase: BrowserSupabase): Promise<DuoWriteResult> {
  return callRpc(() => supabase.rpc("revoke_duo_invitation"));
}

/** « Quitter le duo » (feuille de confirmation du Profil). */
export function leaveDuo(supabase: BrowserSupabase): Promise<DuoWriteResult> {
  return callRpc(() => supabase.rpc("leave_duo"));
}

/**
 * « Rejoindre le duo » depuis l'écran de confirmation. `accentColor` : la
 * nouvelle couleur choisie en cas de conflit, sinon null (couleur gardée).
 * CM-102 : la RPC n'accepte qu'un code dont l'aperçu a été vu juste avant
 * (`fetchInvitationPreview`, appelé par l'écran de confirmation).
 */
export function acceptDuoInvitation(
  supabase: BrowserSupabase,
  rawCode: string,
  accentColor: string | null,
): Promise<DuoWriteResult> {
  const code = normalizeInviteCode(rawCode);
  if (!isValidInviteCode(code)) {
    return Promise.resolve({ ok: false, error: duoErrorMessage("cm87:invitation_invalid") });
  }
  const color = accentColor && isMemberColor(accentColor) ? accentColor : null;
  if (accentColor && !color) {
    return Promise.resolve({ ok: false, error: duoErrorMessage("cm87:color_invalid") });
  }
  return callRpc(() =>
    supabase.rpc("accept_duo_invitation", { p_code: code, p_accent_color: color }),
  );
}

export type InvitationPreview = {
  inviterName: string;
  inviterColor: string;
  expiresAt: string;
  myColor: string;
  colorConflict: boolean;
  alreadyInDuo: boolean;
};

export type InvitationPreviewRead =
  | { ok: true; preview: InvitationPreview }
  | { ok: false; code: DuoErrorCode };

/**
 * Aperçu d'une invitation pour l'écran de confirmation.
 * CM-102 : un code inconnu, expiré, révoqué ou déjà utilisé ne lève pas
 * d'erreur (l'échec est compté en base) : aucune ligne, lu ici comme
 * `invitation_invalid`. Trop d'échecs : `too_many_attempts`. Refus métier
 * (`cm87:…`, `cm102:…`) renvoyé avec son code ; toute autre erreur (réseau)
 * lève : l'écran propose « Réessayer » au lieu de conclure à un code faux.
 */
export async function fetchInvitationPreview(
  supabase: BrowserSupabase,
  code: string,
): Promise<InvitationPreviewRead> {
  const { data, error } = await supabase.rpc("get_duo_invitation", { p_code: code });
  if (error) {
    const known = duoErrorCode(error.message);
    if (known) return { ok: false, code: known };
    throw new Error(`Lecture de l'invitation impossible : ${error.message}`);
  }
  const row = data?.[0];
  if (!row) return { ok: false, code: "invitation_invalid" };
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
