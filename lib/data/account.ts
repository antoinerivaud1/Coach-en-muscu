import { isAuthRetryableFetchError } from "@supabase/supabase-js";
import type { BrowserSupabase } from "@/lib/supabase/client";
import {
  DELETE_CONFIRMATION_WORD,
  deleteAccountErrorMessage,
  isDeleteConfirmation,
  sessionCookieNames,
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
 * Réseau coupé dès la vérification de session : rien n'est parti, « rien
 * n'a été supprimé » (et pas « session expirée »).
 */
export async function deleteMyAccount(
  supabase: Pick<BrowserSupabase, "auth" | "rpc">,
  confirmation: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  let signedIn = false;
  try {
    const { data, error } = await supabase.auth.getClaims();
    if (error && isAuthRetryableFetchError(error)) {
      return { ok: false, error: deleteAccountErrorMessage({ message: "cm60:offline" }) };
    }
    signedIn = !error && !!data?.claims?.sub;
  } catch (e) {
    if (isAuthRetryableFetchError(e)) {
      return { ok: false, error: deleteAccountErrorMessage({ message: "cm60:offline" }) };
    }
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

/** Délai maximal laissé à `signOut` après la suppression. */
export const SIGN_OUT_TIMEOUT_MS = 3_000;

/**
 * Compte supprimé : fermeture de la session sur cet appareil, sans jamais
 * bloquer le départ vers « Compte supprimé ».
 * 1. Les cookies de session (lisibles en JS depuis CM-88, morceaux `.0`,
 *    `.1` compris) sont effacés d'abord : la session est fermée même si la
 *    suite n'aboutit pas.
 * 2. `signOut({ scope: "local" })` vide l'état du client (et prévient les
 *    écouteurs), borné à `timeoutMs` : réseau mort, verrou d'auth bloqué…
 *
 * Les cookies `httpOnly` de l'app restent (illisibles en JS), sans effet :
 * - `cm_onboarded` vaut l'id du compte supprimé ; le middleware ne le lit
 *   qu'avec une session et le compare à son id : un autre compte relit son
 *   profil comme s'il était absent ;
 * - `cm_profile` (ancien sélecteur) n'est plus lu nulle part, et la connexion
 *   suivante l'efface ;
 * - `cm_auth_cookie_v` (marqueur) ne sert qu'en présence d'une session.
 *
 * `doc` est injectable pour les tests (tests/unit/accountExport.spec.ts).
 */
export async function closeDeletedAccountSession(
  supabase: Pick<BrowserSupabase, "auth">,
  doc: { cookie: string } = document,
  timeoutMs: number = SIGN_OUT_TIMEOUT_MS,
): Promise<void> {
  for (const name of sessionCookieNames(doc.cookie)) {
    doc.cookie = `${name}=; Path=/; Max-Age=0; SameSite=Lax`;
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      supabase.auth.signOut({ scope: "local" }),
      new Promise<void>((resolve) => {
        timer = setTimeout(resolve, timeoutMs);
      }),
    ]);
  } catch {
    // Cookies déjà effacés : rien d'autre à faire.
  } finally {
    clearTimeout(timer);
  }
}
