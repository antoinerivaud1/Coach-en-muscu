/**
 * CM-86 : aide pure des écrans d'onboarding. CM-88 (PR 7) : le contexte
 * (session, identité, email) est lu dans le navigateur
 * (hooks/data/useOnboardingContext.ts) ; plus aucun import serveur ici.
 */

/**
 * Prénom à pré-remplir : le trigger `handle_new_user` met le début de l'email
 * comme nom provisoire (« camille.dupont »). Celui-là n'est pas un prénom, on
 * laisse le champ vide ; un prénom déjà saisi (retour arrière) est gardé.
 */
export function prefilledFirstName(displayName: string, email: string | null): string {
  const local = (email ?? "").split("@")[0] ?? "";
  if (!displayName || displayName === local || displayName === "Moi") return "";
  return displayName;
}
