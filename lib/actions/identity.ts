"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfileId } from "@/lib/profile";
import { writeIdentity, type IdentityWriteResult } from "@/lib/data/profile";
import { withNext } from "@/lib/auth/core";
import {
  validateIdentityInput,
  type IdentityFieldErrors,
  type IdentityInput,
} from "@/lib/onboarding";
import { SESSION_EXPIRED_MESSAGE } from "@/lib/supabase/rlsErrors";

/**
 * CM-86 : prénom, couleur et objectif hebdo. Une seule écriture
 * (`writeIdentity`, lib/data/profile.ts), partagée par l'étape « Comment on
 * t'appelle ? » de l'onboarding (cette server action) et la section « Mon
 * profil » du Profil (CM-88 : écrite depuis le navigateur).
 *
 * CM-103 : dans un duo, chaque membre garde sa couleur. La couleur du
 * partenaire (lue via les données du duo) est refusée ici aussi, pas
 * seulement grisée à l'écran. Un solo n'a aucune restriction.
 */

export type IdentityFormState = {
  error?: string;
  fieldErrors?: IdentityFieldErrors;
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

/** CM-88 : écriture partagée avec le Profil (lib/data/profile.ts), client serveur ici. */
async function saveIdentity(value: IdentityInput): Promise<IdentityWriteResult> {
  const profileId = await getCurrentProfileId();
  if (!profileId) return { ok: false, error: SESSION_EXPIRED_MESSAGE };
  return writeIdentity(await createClient(), profileId, value);
}

/** Onboarding, étape 2 : enregistre puis passe au choix des séances. */
export async function saveOnboardingProfile(
  _prev: IdentityFormState,
  formData: FormData,
): Promise<IdentityFormState> {
  const values = readForm(formData);
  const parsed = validateIdentityInput(values);
  if (!parsed.ok) return { fieldErrors: parsed.errors, values };

  // CM-103 : destination finale conservée (lien d'invitation).
  const next = String(formData.get("next") ?? "");
  const result = await saveIdentity(parsed.value);
  if (!result.ok) {
    if (result.error === SESSION_EXPIRED_MESSAGE) redirect("/login");
    return { error: result.error, fieldErrors: result.fieldErrors, values };
  }
  redirect(withNext("/onboarding/seances", next));
}
