"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import {
  authErrorMessage,
  isUuid,
  safeNextPath,
  validateLoginInput,
  validatePasswordCreation,
  type FieldErrors,
} from "@/lib/auth/core";
import { getAuthMode } from "@/lib/auth/mode";
import { PROFILE_COOKIE, getAuthState, getProfile } from "@/lib/profile";
import { createAuthClient } from "@/lib/supabase/auth-server";
import { createClient } from "@/lib/supabase/server";

export type AuthFormState = {
  error?: string;
  fieldErrors?: FieldErrors;
  /** Email resaisi, pour ne pas vider le champ après une erreur. */
  email?: string;
};

/**
 * CM-58 : connexion email + mot de passe (`/login`). Modes `hybrid` et
 * `required` uniquement. Les cookies de session sont posés par le client
 * @supabase/ssr. Le cookie `cm_profile` est effacé : la session prime.
 */
export async function signInWithPassword(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  if (getAuthMode() === "cookie") redirect("/");

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
  store.delete(PROFILE_COOKIE);
  revalidatePath("/", "layout");
  // Chemin interne uniquement (pas d'open redirect).
  redirect(safeNextPath(String(formData.get("next") ?? "")));
}

/**
 * CM-58 : déconnexion (cet appareil seulement). Efface aussi `cm_profile`
 * pour qu'en `hybrid` on ne retombe pas silencieusement sur l'ancien profil.
 */
export async function signOut(): Promise<void> {
  const mode = getAuthMode();
  if (mode !== "cookie") {
    try {
      const supabase = await createAuthClient();
      await supabase.auth.signOut({ scope: "local" });
    } catch {
      // Session déjà invalide : on nettoie quand même les cookies locaux.
    }
  }
  const store = await cookies();
  store.delete(PROFILE_COOKIE);
  revalidatePath("/", "layout");
  redirect(mode === "required" ? "/login" : "/");
}

/**
 * CM-58 : bloc « Créer mon mot de passe » de l'écran Profil, mode `hybrid`
 * uniquement. Crée le compte Auth du profil courant via l'API admin, AVEC
 * l'id du profil (`profiles.id = auth.users.id`, aucune donnée déplacée),
 * puis ouvre la session.
 *
 * Qui peut créer quoi : uniquement un compte pour le profil désigné par le
 * cookie `cm_profile` de la requête (jamais un id venu du formulaire), et
 * seulement s'il n'existe encore aucun compte pour cet id. Limite connue : en
 * `hybrid`, ce cookie reste falsifiable, d'où une fenêtre `hybrid` courte et
 * la vérification des emails avant `required` (supabase/ops/2026-10-cm58-bascule.md).
 */
export async function createPasswordForCurrentProfile(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const rawEmail = String(formData.get("email") ?? "");
  const state = await getAuthState();
  if (state.mode !== "hybrid") {
    return { error: "La création de mot de passe n'est pas ouverte pour le moment.", email: rawEmail };
  }
  if (state.source !== "cookie" || !isUuid(state.profileId)) {
    return { error: "Tu es déjà connecté avec un compte.", email: rawEmail };
  }
  const profileId = state.profileId;

  const parsed = validatePasswordCreation({
    email: rawEmail,
    password: String(formData.get("password") ?? ""),
    confirm: String(formData.get("confirm") ?? ""),
  });
  if (!parsed.ok) return { fieldErrors: parsed.errors, email: rawEmail };

  const admin = await createClient();
  const profile = await getProfile(admin, profileId);
  if (!profile) return { error: "Profil introuvable.", email: parsed.email };

  // Refus si un compte existe déjà pour cet id.
  const existing = await admin.auth.admin.getUserById(profileId);
  if (existing.data.user) {
    return {
      error: "Un compte existe déjà pour ce profil : connecte-toi avec ton mot de passe.",
      email: parsed.email,
    };
  }
  if (existing.error && existing.error.status !== 404) {
    return { error: authErrorMessage(existing.error), email: parsed.email };
  }

  const created = await admin.auth.admin.createUser({
    id: profileId,
    email: parsed.email,
    password: parsed.password,
    email_confirm: true,
    user_metadata: { display_name: profile.display_name },
  });
  if (created.error || !created.data.user) {
    return { error: authErrorMessage(created.error), email: parsed.email };
  }
  if (created.data.user.id !== profileId) {
    // Ne doit jamais arriver (l'API respecte `id`). On annule pour ne pas
    // laisser un compte détaché de tout profil.
    await admin.auth.admin.deleteUser(created.data.user.id);
    return { error: authErrorMessage(null), email: parsed.email };
  }

  const supabase = await createAuthClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.email,
    password: parsed.password,
  });
  if (error) {
    return {
      error: "Compte créé, mais la connexion a échoué. Connecte-toi depuis l'écran de connexion.",
      email: parsed.email,
    };
  }

  const store = await cookies();
  store.delete(PROFILE_COOKIE);
  revalidatePath("/", "layout");
  redirect("/profile");
}
