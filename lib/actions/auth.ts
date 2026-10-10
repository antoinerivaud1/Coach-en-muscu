"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
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
  redirect(safeNextPath(String(formData.get("next") ?? "")));
}

/** CM-58 : déconnexion (cet appareil seulement), puis retour à `/login`. */
export async function signOut(): Promise<void> {
  try {
    const supabase = await createAuthClient();
    await supabase.auth.signOut({ scope: "local" });
  } catch {
    // Session déjà invalide : on nettoie quand même les cookies locaux.
  }
  const store = await cookies();
  store.delete(LEGACY_PROFILE_COOKIE);
  revalidatePath("/", "layout");
  redirect("/login");
}
