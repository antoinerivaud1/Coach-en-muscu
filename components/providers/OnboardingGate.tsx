"use client";

import { useEffect, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ScreenSkeleton } from "@/components/ScreenState";
import { useProfileId } from "@/hooks/useProfileId";
import { useOnboardingState } from "@/hooks/data/useOnboardingState";
import {
  hasOnboardedMark,
  isOnboardingExemptPath,
  onboardingGateDecision,
  rememberOnboarded,
} from "@/lib/onboarding";

/**
 * CM-89 (PR 1) : redirection vers `/onboarding` d'un compte connecté qui ne
 * l'a pas terminé (CM-86), faite dans le navigateur. Elle était dans le
 * middleware, absent du bundle natif (export statique, Capacitor) : une
 * seule règle pour le web et l'app (`onboardingGateDecision`, lib/onboarding.ts).
 *
 * - Chemins exemptés (onboarding, connexion, pages publiques) : rien n'est lu.
 * - Tant que la session ou `onboarded_at` n'est pas connu : squelette neutre
 *   À LA PLACE de l'écran, pour qu'un compte pas onboardé n'entrevoie jamais
 *   un écran privé (le middleware redirigeait avant tout affichage).
 * - Onboarding constaté : mémorisé pour ce compte (`localStorage`), plus
 *   jamais relu ensuite : un compte onboardé n'attend que sa session, que
 *   chaque écran lit de toute façon (même requête en cache).
 * - Sans session, ou session ou profil illisible : l'écran s'affiche (il
 *   renvoie lui-même vers /login ou propose « Réessayer »). C'est un
 *   parcours, pas un contrôle d'accès : la RLS protège les données.
 */
export default function OnboardingGate({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname() ?? "/";
  const exempt = isOnboardingExemptPath(pathname);
  const auth = useProfileId({ enabled: !exempt });
  const profileId = auth.data ?? null;
  // Lu à chaque rendu (lecture synchrone, sans coût) : aucune lecture avant
  // la session, donc rien de différent entre le HTML et l'hydratation.
  const remembered = !!profileId && hasOnboardedMark(profileId);
  const state = useOnboardingState(exempt || remembered ? null : profileId);

  const decision = onboardingGateDecision({
    pathname,
    // `?code=…` d'un lien d'invitation, conservé en `next` (CM-103). Lu
    // ici plutôt que par useSearchParams, qui forcerait un <Suspense> autour
    // de toute l'app au build statique.
    search: typeof window === "undefined" ? "" : window.location.search,
    session: auth.data
      ? "signedIn"
      : auth.data === null
        ? "signedOut"
        : auth.error
          ? "error"
          : "pending",
    remembered,
    state,
  });
  const target = decision.kind === "redirect" ? decision.to : null;

  useEffect(() => {
    if (target) router.replace(target);
  }, [target, router]);

  useEffect(() => {
    if (profileId && state === "done") rememberOnboarded(profileId);
  }, [profileId, state]);

  if (decision.kind === "render") return <>{children}</>;
  return (
    <main className="min-h-[100dvh] p-4 pt-[max(1rem,env(safe-area-inset-top))]">
      <div className="mx-auto max-w-lg pt-10">
        <ScreenSkeleton label="Chargement" />
      </div>
    </main>
  );
}
