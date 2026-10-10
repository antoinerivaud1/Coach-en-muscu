"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { LEGACY_PROFILE_COOKIE } from "@/lib/auth/core";
import { ONBOARDED_COOKIE } from "@/lib/onboarding";
import { getCurrentProfileId } from "@/lib/profile";
import { createAuthClient } from "@/lib/supabase/server";
import { hasSupabaseAuthCookie } from "@/lib/supabase/auth-config";
import {
  ACCOUNT_DELETED_PATH,
  DELETE_CONFIRMATION_WORD,
  deleteAccountErrorMessage,
  isDeleteConfirmation,
} from "@/lib/accountDeletion";

export type DeleteAccountState = { error?: string };

/**
 * CM-60 : « Supprimer mon compte » (feuille de confirmation du Profil).
 *
 * La RPC `delete_my_account` (security definer) supprime le compte de
 * l'appelant en UNE transaction : elle passe toujours par le client
 * utilisateur (`createAuthClient`), même avec le filet DATA_CLIENT=service
 * dont la clé n'a pas d'utilisateur (comme les RPC du duo). Aucune clé
 * service-role.
 *
 * Échec : message, rien n'est supprimé, la session reste ouverte.
 * Succès : session fermée sur cet appareil (cookies effacés), puis la page
 * publique « Compte supprimé », qui vide les files locales du téléphone.
 */
export async function deleteMyAccount(
  _prev: DeleteAccountState,
  formData: FormData,
): Promise<DeleteAccountState> {
  if (!(await getCurrentProfileId())) {
    return { error: deleteAccountErrorMessage("cm60:not_authenticated") };
  }
  if (!isDeleteConfirmation(String(formData.get("confirmation") ?? ""))) {
    return { error: deleteAccountErrorMessage("cm60:confirmation_required") };
  }

  const supabase = await createAuthClient();
  let failure: string | null = null;
  try {
    const { error } = await supabase.rpc("delete_my_account", {
      p_confirmation: DELETE_CONFIRMATION_WORD,
    });
    if (error) failure = error.message;
  } catch (e) {
    failure = e instanceof Error ? e.message : "network";
  }
  if (failure !== null) {
    console.error("[CM-60] suppression refusée :", failure);
    return { error: deleteAccountErrorMessage(failure) };
  }

  // Le compte n'existe plus : fermeture de la session locale. GoTrue répond
  // « introuvable » au logout, que supabase-js ignore ; les cookies sont de
  // toute façon effacés ci-dessous.
  try {
    await supabase.auth.signOut({ scope: "local" });
  } catch {
    // Rien à faire : nettoyage manuel juste après.
  }
  const store = await cookies();
  for (const { name } of store.getAll()) {
    if (hasSupabaseAuthCookie([name])) store.delete(name);
  }
  store.delete(ONBOARDED_COOKIE);
  store.delete(LEGACY_PROFILE_COOKIE);
  redirect(ACCOUNT_DELETED_PATH);
}
