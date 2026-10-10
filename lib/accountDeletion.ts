// CM-60 : suppression du compte (règles pures, sans import Next ni Supabase).
// Testé dans tests/unit/accountExport.spec.ts.

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
};

const GENERIC_DELETE_ERROR =
  "La suppression n'a pas abouti. Rien n'a été supprimé\u00a0: réessaie dans un instant.";

/**
 * Message français d'une erreur de `delete_my_account` (`cm60:<code>`).
 * Toute autre erreur (réseau, cm87_ réutilisée, base) : message générique.
 * La RPC tient en une transaction : un échec n'a rien supprimé.
 */
export function deleteAccountErrorMessage(message: string | null | undefined): string {
  const code = /cm60:([a-z_]+)/.exec(message ?? "")?.[1];
  return (code && DELETE_ERROR_MESSAGES[code]) || GENERIC_DELETE_ERROR;
}
