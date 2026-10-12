// CM-60 : suppression du compte (règles pures, sans import Next ni Supabase).
// Testé dans tests/unit/accountExport.spec.ts.

import { hasSupabaseAuthCookie } from "@/lib/supabase/auth-config";

/** Mot à saisir pour activer le bouton, et seul mot accepté par la RPC. */
export const DELETE_CONFIRMATION_WORD = "SUPPRIMER";

/** Page publique affichée une fois le compte supprimé (lib/auth/publicPaths.ts). */
export const ACCOUNT_DELETED_PATH = "/compte-supprime";

/**
 * La saisie confirme-t-elle la suppression ? Casse et espaces autour ignorés
 * (clavier du téléphone : majuscule automatique, espace ajoutée par la
 * suggestion) ; tout autre mot, même proche, est refusé.
 */
export function isDeleteConfirmation(input: string | null | undefined): boolean {
  if (typeof input !== "string") return false;
  return input.trim().toLocaleUpperCase("fr-FR") === DELETE_CONFIRMATION_WORD;
}

const DELETE_ERROR_MESSAGES: Record<string, string> = {
  not_authenticated: "Ta session a expiré. Reconnecte-toi, puis recommence.",
  confirmation_required: `Écris «\u00a0${DELETE_CONFIRMATION_WORD}\u00a0» pour confirmer.`,
  account_not_found: "Ce compte n'existe plus. Il a peut-être déjà été supprimé.",
  // CM-88 : réseau coupé AVANT l'appel de suppression (vérification de la
  // session dans le navigateur) : la base n'a rien reçu.
  offline:
    "Connexion impossible. Rien n'a été supprimé : vérifie ta connexion, puis réessaie.",
};

/**
 * CM-88 : noms des cookies de session Supabase (`sb-<ref>-auth-token`, et ses
 * morceaux `.0`, `.1`…) présents dans `document.cookie`, à effacer après la
 * suppression du compte. CM-89 (PR 4) : web seulement ; dans l'app native, la
 * session est dans Preferences (`clearPreferencesSession`).
 */
export function sessionCookieNames(documentCookie: string): string[] {
  return documentCookie
    .split(";")
    .map((pair) => pair.split("=")[0]?.trim() ?? "")
    .filter((name) => hasSupabaseAuthCookie([name]));
}

/** La base a refusé l'appel : la transaction est annulée, rien n'est supprimé. */
const REFUSED_DELETE_ERROR =
  "La suppression n'a pas abouti. Rien n'a été supprimé\u00a0: réessaie dans un instant.";

/**
 * Aucune réponse exploitable (réseau coupé, passerelle en erreur) : la
 * suppression a pu être validée en base sans que l'app le sache.
 */
const UNCONFIRMED_DELETE_ERROR =
  "La suppression n'a pas pu être confirmée. Reconnecte-toi pour vérifier.";

export type DeleteAccountError = { message?: string | null; code?: string | null };

/**
 * L'erreur prouve-t-elle que la base a REFUSÉ l'appel (donc rien fait) ?
 * Oui pour une erreur PostgreSQL (SQLSTATE à 5 caractères : P0001 pour nos
 * `cm60:`, 42501 droits, 40P01 interblocage…) ou PostgREST (`PGRST…`,
 * refusée avant exécution). Non pour une erreur réseau ou une réponse de
 * passerelle sans code : la transaction a pu aller au bout.
 */
export function isExplicitRefusal(error: DeleteAccountError | null | undefined): boolean {
  if (!error) return false;
  if (/cm60:[a-z_]+/.test(error.message ?? "")) return true;
  const code = error.code ?? "";
  return /^[0-9A-Z]{5}$/.test(code) || /^PGRST\d+$/.test(code);
}

/**
 * Message français d'un échec de `delete_my_account`. Codes `cm60:<code>` :
 * message dédié. Autre refus explicite de la base : « Rien n'a été
 * supprimé ». Sinon (réseau, passerelle) : suppression non confirmée.
 */
export function deleteAccountErrorMessage(error: DeleteAccountError | null | undefined): string {
  const code = /cm60:([a-z_]+)/.exec(error?.message ?? "")?.[1];
  if (code && DELETE_ERROR_MESSAGES[code]) return DELETE_ERROR_MESSAGES[code];
  return isExplicitRefusal(error) ? REFUSED_DELETE_ERROR : UNCONFIRMED_DELETE_ERROR;
}
