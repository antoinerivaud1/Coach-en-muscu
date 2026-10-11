import type { BrowserSupabase } from "@/lib/supabase/client";
import { hasSupabaseAuthCookie } from "@/lib/supabase/auth-config";
import {
  DELETE_CONFIRMATION_WORD,
  deleteAccountErrorMessage,
  isDeleteConfirmation,
  type DeleteAccountError,
} from "@/lib/accountDeletion";

/**
 * CM-60 / CM-88 : « Supprimer mon compte », depuis le navigateur.
 *
 * La RPC `delete_my_account` (security definer) supprime le compte de
 * l'appelant (`auth.uid()`) en UNE transaction ; le client navigateur porte
 * la session de l'utilisateur. Aucune clé service-role.
 *
 * Échec : message, la session reste ouverte. Refus explicite de la base :
 * rien n'est supprimé (transaction annulée). Réponse perdue : « non
 * confirmée », jamais « rien n'a été supprimé » (`deleteAccountErrorMessage`).
 */
export async function deleteMyAccount(
  supabase: BrowserSupabase,
  confirmation: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  let signedIn = false;
  try {
    const { data } = await supabase.auth.getClaims();
    signedIn = !!data?.claims?.sub;
  } catch {
    signedIn = false;
  }
  if (!signedIn) {
    return { ok: false, error: deleteAccountErrorMessage({ message: "cm60:not_authenticated" }) };
  }
  if (!isDeleteConfirmation(confirmation)) {
    return { ok: false, error: deleteAccountErrorMessage({ message: "cm60:confirmation_required" }) };
  }

  let failure: DeleteAccountError | null = null;
  try {
    const { error } = await supabase.rpc("delete_my_account", {
      p_confirmation: DELETE_CONFIRMATION_WORD,
    });
    if (error) failure = { message: error.message, code: error.code };
  } catch (e) {
    failure = { message: e instanceof Error ? e.message : "network", code: null };
  }
  if (failure !== null) {
    console.error("[CM-60] suppression en échec :", failure.code, failure.message);
    return { ok: false, error: deleteAccountErrorMessage(failure) };
  }
  return { ok: true };
}

/**
 * Compte supprimé : fermeture de la session sur cet appareil. GoTrue répond
 * « introuvable » au logout, que supabase-js ignore ; si la réponse se perd,
 * les cookies de session (lisibles en JS depuis CM-88) sont effacés à la main.
 *
 * Les cookies `httpOnly` de l'app restent (illisibles en JS), sans effet :
 * - `cm_onboarded` vaut l'id du compte supprimé ; le middleware ne le lit
 *   qu'avec une session et le compare à son id : un autre compte relit son
 *   profil comme s'il était absent ;
 * - `cm_profile` (ancien sélecteur) n'est plus lu nulle part, et la connexion
 *   suivante l'efface ;
 * - `cm_auth_cookie_v` (marqueur) ne sert qu'en présence d'une session.
 */
export async function closeDeletedAccountSession(supabase: BrowserSupabase): Promise<void> {
  try {
    await supabase.auth.signOut({ scope: "local" });
  } catch {
    // Nettoyage manuel juste après.
  }
  for (const pair of document.cookie.split(";")) {
    const name = pair.split("=")[0]?.trim() ?? "";
    if (hasSupabaseAuthCookie([name])) {
      document.cookie = `${name}=; Path=/; Max-Age=0; SameSite=Lax`;
    }
  }
}
