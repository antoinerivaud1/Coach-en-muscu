"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { queryKeys } from "@/lib/data/queryKeys";
import { fetchAccountEmail } from "@/lib/data/onboarding";
import { onboardingDestination } from "@/lib/onboarding";
import type { Identity } from "@/lib/queries/identity";
import { useRequireProfileId } from "@/hooks/useProfileId";
import { useIdentity } from "@/hooks/data/useIdentity";

export type OnboardingContext =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; profileId: string; identity: Identity; email: string | null };

/**
 * CM-86 / CM-88 (PR 7) : contexte des écrans d'onboarding, lu dans le
 * navigateur (remplace `requireOnboardingIdentity` côté serveur).
 * - Sans session : connexion (`/login?next=<path>`).
 * - Onboarding déjà terminé : accueil (Antoine et Léa ne le revoient
 *   jamais), ou CM-103 la destination `next` conservée (confirmation
 *   d'invitation).
 * - C7 : profil illisible (erreur réseau) ou introuvable : `error`, l'écran
 *   affiche « Réessayer ». Surtout pas de redirection : `OnboardingGate`
 *   renverrait vers /onboarding (boucle possible).
 */
export function useOnboardingContext(path: string, next: string): OnboardingContext {
  const router = useRouter();
  const auth = useRequireProfileId(path);
  const profileId = auth.profileId;
  const identity = useIdentity(profileId);
  const email = useQuery({
    queryKey: queryKeys.account.email(profileId ?? ""),
    queryFn: () => fetchAccountEmail(getSupabaseBrowserClient()),
    enabled: !!profileId,
    // L'email d'un compte ne change pas pendant l'onboarding.
    staleTime: Infinity,
  });

  // `onboarded_at` ne revient jamais à null : une valeur en cache suffit.
  const done = !!identity.data?.onboarded_at;
  useEffect(() => {
    if (done) router.replace(onboardingDestination("/dashboard", next));
  }, [done, next, router]);

  if ((auth.error && !profileId) || (identity.error && identity.data === undefined)) {
    return { status: "error" };
  }
  if (auth.isPending || !profileId || identity.data === undefined || email.isPending || done) {
    return { status: "loading" };
  }
  if (identity.data === null) return { status: "error" };
  return { status: "ready", profileId, identity: identity.data, email: email.data ?? null };
}
