import { redirect } from "next/navigation";
import { requireProfileId } from "@/lib/profile";
import { createClient, createAuthClient } from "@/lib/supabase/server";
import { readIdentity, type Identity } from "@/lib/queries/identity";

export type OnboardingContext =
  | { ok: true; identity: Identity; email: string | null }
  | { ok: false };

/**
 * CM-86 : contexte serveur des écrans d'onboarding. Sans session : connexion.
 * Onboarding déjà terminé : accueil (Antoine et Léa ne le revoient jamais).
 *
 * C7 : profil illisible (erreur réseau) ou introuvable : `{ ok: false }`, la
 * page affiche un écran d'erreur avec « Réessayer ». Surtout pas de
 * redirection : le middleware renverrait vers /onboarding (boucle possible
 * /onboarding → /login → /dashboard → /onboarding).
 */
export async function requireOnboardingIdentity(path: string): Promise<OnboardingContext> {
  const profileId = await requireProfileId(path);
  const supabase = await createClient();
  const read = await readIdentity(supabase, profileId);
  if (!read.ok || !read.identity) return { ok: false };
  const identity = read.identity;
  if (identity.onboarded_at) redirect("/dashboard");

  let email: string | null = null;
  try {
    const auth = await createAuthClient();
    const { data } = await auth.auth.getClaims();
    const raw = data?.claims?.email;
    email = typeof raw === "string" ? raw : null;
  } catch {
    email = null;
  }
  return { ok: true, identity, email };
}

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
