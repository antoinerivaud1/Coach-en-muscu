"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfileId } from "@/lib/profile";
import {
  validateIdentityInput,
  type IdentityFieldErrors,
  type IdentityInput,
} from "@/lib/onboarding";
import {
  REFUSED_MESSAGE,
  SESSION_EXPIRED_MESSAGE,
  touchedRows,
  writeErrorMessage,
} from "@/lib/supabase/rlsErrors";

/**
 * CM-86 : prénom, couleur et objectif hebdo. Une seule écriture, partagée par
 * l'étape « Comment on t'appelle ? » de l'onboarding et la section « Mon
 * profil » du Profil.
 */

export type IdentityFormState = {
  error?: string;
  fieldErrors?: IdentityFieldErrors;
  /** Vrai après un enregistrement réussi (section du Profil). */
  saved?: boolean;
  /** Valeurs resaisies, pour ne rien perdre après une erreur. */
  values?: { displayName: string; accentColor: string; weeklyGoal: string };
};

function readForm(formData: FormData) {
  return {
    displayName: String(formData.get("display_name") ?? ""),
    accentColor: String(formData.get("accent_color") ?? ""),
    weeklyGoal: String(formData.get("weekly_goal") ?? ""),
  };
}

async function writeIdentity(
  value: IdentityInput,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const profileId = await getCurrentProfileId();
  if (!profileId) return { ok: false, error: SESSION_EXPIRED_MESSAGE };

  const supabase = await createClient();
  // CM-59 B : sous RLS, un update refusé touche 0 ligne sans erreur.
  const { data, error } = await supabase
    .from("profiles")
    .update({
      display_name: value.displayName,
      accent_color: value.accentColor,
      weekly_goal: value.weeklyGoal,
    })
    .eq("id", profileId)
    .select("id");
  if (error) return { ok: false, error: writeErrorMessage(error) };
  if (!touchedRows(data)) return { ok: false, error: REFUSED_MESSAGE };
  return { ok: true };
}

/** Onboarding, étape 2 : enregistre puis passe au choix des séances. */
export async function saveOnboardingProfile(
  _prev: IdentityFormState,
  formData: FormData,
): Promise<IdentityFormState> {
  const values = readForm(formData);
  const parsed = validateIdentityInput(values);
  if (!parsed.ok) return { fieldErrors: parsed.errors, values };

  const result = await writeIdentity(parsed.value);
  if (!result.ok) {
    if (result.error === SESSION_EXPIRED_MESSAGE) redirect("/login");
    return { error: result.error, values };
  }
  redirect("/onboarding/seances");
}

/** Profil, section « Mon profil ». */
export async function updateIdentity(
  _prev: IdentityFormState,
  formData: FormData,
): Promise<IdentityFormState> {
  const values = readForm(formData);
  const parsed = validateIdentityInput(values);
  if (!parsed.ok) return { fieldErrors: parsed.errors, values };

  const result = await writeIdentity(parsed.value);
  if (!result.ok) return { error: result.error, values };

  revalidatePath("/profile");
  revalidatePath("/dashboard");
  revalidatePath("/progress");
  return { saved: true, values };
}
