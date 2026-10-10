"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireProfileId } from "@/lib/profile";
import { duoRpcClient } from "@/lib/queries/duo";
import { duoErrorMessage, isValidInviteCode, normalizeInviteCode } from "@/lib/duo";
import { isMemberColor } from "@/lib/members";

/**
 * CM-87 : actions du duo optionnel. Toutes passent par les RPC security
 * definer de supabase/migrations/20261010191000_cm87_duo_rpc.sql (aucune
 * écriture directe sur duos, duo_members ni duo_invitations), avec le client
 * utilisateur (voir `duoRpcClient`).
 */

/** Tous les écrans qui montrent le duo, la bibliothèque ou une comparaison. */
function revalidateDuoScreens() {
  for (const path of ["/profile", "/dashboard", "/seances", "/progress", "/history"]) {
    revalidatePath(path);
  }
}

export type DuoActionState = { error?: string };

/** « Inviter mon partenaire » : crée (ou remplace) l'invitation, puis l'affiche. */
export async function createInvitation(): Promise<DuoActionState> {
  await requireProfileId("/profile");
  const rpc = await duoRpcClient();
  const { error } = await rpc.rpc("create_duo_invitation");
  if (error) return { error: duoErrorMessage(error.message) };
  revalidateDuoScreens();
  redirect("/duo/inviter");
}

/** « Annuler l'invitation » : retour au profil, solo. */
export async function revokeInvitation(): Promise<DuoActionState> {
  await requireProfileId("/profile");
  const rpc = await duoRpcClient();
  const { error } = await rpc.rpc("revoke_duo_invitation");
  if (error) return { error: duoErrorMessage(error.message) };
  revalidateDuoScreens();
  redirect("/profile");
}

/** « Rejoindre le duo » depuis l'écran de confirmation. */
export async function acceptInvitation(
  _prev: DuoActionState,
  formData: FormData,
): Promise<DuoActionState> {
  const code = normalizeInviteCode(String(formData.get("code") ?? ""));
  await requireProfileId(`/duo/rejoindre?code=${code}`);
  if (!isValidInviteCode(code)) return { error: duoErrorMessage("cm87:invitation_invalid") };

  const rawColor = String(formData.get("accent_color") ?? "");
  const color = rawColor && isMemberColor(rawColor) ? rawColor : null;
  if (rawColor && !color) return { error: duoErrorMessage("cm87:color_invalid") };

  const rpc = await duoRpcClient();
  const { error } = await rpc.rpc("accept_duo_invitation", {
    p_code: code,
    p_accent_color: color,
  });
  if (error) return { error: duoErrorMessage(error.message) };
  revalidateDuoScreens();
  redirect("/dashboard");
}

/** « Quitter le duo » (feuille de confirmation du Profil). */
export async function leaveDuo(): Promise<DuoActionState> {
  await requireProfileId("/profile");
  const rpc = await duoRpcClient();
  const { error } = await rpc.rpc("leave_duo");
  if (error) return { error: duoErrorMessage(error.message) };
  revalidateDuoScreens();
  redirect("/profile");
}
