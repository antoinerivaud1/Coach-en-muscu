"use client";

import type { OnboardingState } from "@/lib/onboarding";
import { useIdentity } from "@/hooks/data/useIdentity";

/**
 * CM-89 (PR 1) : `onboarded_at` du compte connecté, lu sous RLS dans le
 * navigateur (remplace la lecture du middleware). Même lecture que l'écran
 * Profil et l'onboarding (`useIdentity`) : après une redirection vers
 * `/onboarding`, le profil y est déjà en cache.
 *
 * `profileId` null : aucune lecture (`loading`). Profil illisible (réseau)
 * ou introuvable : `unknown`, on laisse passer.
 */
export function useOnboardingState(profileId: string | null): OnboardingState | "loading" {
  const identity = useIdentity(profileId);
  if (!profileId) return "loading";
  if (identity.data === undefined) return identity.error ? "unknown" : "loading";
  if (identity.data === null) return "unknown";
  return identity.data.onboarded_at ? "done" : "pending";
}
