"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { LEGACY_PROFILE_COOKIE, authErrorMessage } from "@/lib/auth/core";
import {
  ONBOARDED_COOKIE,
  isSignupEnabled,
  validateSignupInput,
  type SignupFieldErrors,
} from "@/lib/onboarding";
import { createAuthClient } from "@/lib/supabase/server";

export type SignupFormState = {
  error?: string;
  fieldErrors?: SignupFieldErrors;
  email?: string;
};

/**
 * CM-86 : inscription email + mot de passe, puis onboarding.
 *
 * Fermée tant que `SIGNUP_ENABLED` (variable serveur) n'est pas à 1 : la page
 * ne montre alors pas le formulaire, et cette action refuse aussi (un POST
 * direct ne doit pas créer de compte). Pas de confirmation d'email (pas de
 * SMTP avant CM-97) : Supabase renvoie la session tout de suite, les cookies
 * sont posés par le client @supabase/ssr.
 */
export async function signUpWithPassword(
  _prev: SignupFormState,
  formData: FormData,
): Promise<SignupFormState> {
  if (!isSignupEnabled(process.env.SIGNUP_ENABLED)) {
    return { error: "Les inscriptions ouvriront bientôt." };
  }

  const rawEmail = String(formData.get("email") ?? "");
  const parsed = validateSignupInput({
    email: rawEmail,
    password: String(formData.get("password") ?? ""),
  });
  if (!parsed.ok) return { fieldErrors: parsed.errors, email: rawEmail };

  const supabase = await createAuthClient();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.email,
    password: parsed.password,
  });
  if (error) return { error: authErrorMessage(error), email: parsed.email };
  if (!data.session) {
    // Confirmation d'email activée côté Supabase : pas de session à ce stade.
    return {
      error: "Compte créé, mais la connexion automatique a échoué. Connecte-toi.",
      email: parsed.email,
    };
  }

  const store = await cookies();
  store.delete(LEGACY_PROFILE_COOKIE);
  // Un cookie d'onboarding d'un autre compte sur cet appareil ne doit rien sauter.
  store.delete(ONBOARDED_COOKIE);
  revalidatePath("/", "layout");
  redirect("/onboarding");
}
