"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import {
  LEGACY_PROFILE_COOKIE,
  authErrorMessage,
  safeNextPath,
  validateLoginInput,
  type FieldErrors,
} from "@/lib/auth/core";
import { createAuthClient } from "@/lib/supabase/server";

export type AuthFormState = {
  error?: string;
  fieldErrors?: FieldErrors;
  /** Email resaisi, pour ne pas vider le champ après une erreur. */
  email?: string;
  /**
   * CM-88 : destination après connexion, ouverte par RECHARGEMENT COMPLET
   * côté client (`useFullPageRedirect`) : le cache du navigateur repart de
   * zéro. Jamais `redirect()` ici (navigation client, cache conservé).
   */
  redirectTo?: string;
};

/**
 * CM-58 : connexion email + mot de passe (`/login`). Les cookies de session
 * sont posés par le client @supabase/ssr. L'ancien cookie `cm_profile` est
 * effacé s'il traîne encore.
 */
export async function signInWithPassword(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const rawEmail = String(formData.get("email") ?? "");
  const parsed = validateLoginInput({
    email: rawEmail,
    password: String(formData.get("password") ?? ""),
  });
  if (!parsed.ok) return { fieldErrors: parsed.errors, email: rawEmail };

  const supabase = await createAuthClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.email,
    password: parsed.password,
  });
  if (error) return { error: authErrorMessage(error), email: parsed.email };

  const store = await cookies();
  store.delete(LEGACY_PROFILE_COOKIE);
  revalidatePath("/", "layout");
  // Chemin interne uniquement (pas d'open redirect).
  return { redirectTo: safeNextPath(String(formData.get("next") ?? "")) };
}

/**
 * CM-58 : déconnexion (cet appareil seulement). CM-88 : renvoie `/login`, que
 * le bouton ouvre par rechargement complet (cache du navigateur vidé).
 */
export async function signOut(): Promise<{ redirectTo: string }> {
  try {
    const supabase = await createAuthClient();
    await supabase.auth.signOut({ scope: "local" });
  } catch {
    // Session déjà invalide : on nettoie quand même les cookies locaux.
  }
  const store = await cookies();
  store.delete(LEGACY_PROFILE_COOKIE);
  revalidatePath("/", "layout");
  return { redirectTo: "/login" };
}
