"use client";

import { useEffect, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ScreenSkeleton } from "@/components/ScreenState";
import { useProfileId } from "@/hooks/useProfileId";
import { useOnboardingState } from "@/hooks/data/useOnboardingState";
import {
  hasOnboardedMark,
  isOnboardingExemptPath,
  latchOnboardingGate,
  onboardingGateDecision,
  rememberOnboarded,
  type OnboardingGateLatch,
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
 * - Écran déjà affiché : il le reste (`latchOnboardingGate`), même si la
 *   session repasse en lecture (session perdue en pleine séance : le logger
 *   garde sa saisie, CM-59 B). Seul un autre compte ou un autre chemin
 *   relance la vérification.
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
  const session = auth.data
    ? "signedIn"
    : auth.data === null
      ? "signedOut"
      : auth.error
        ? "error"
        : "pending";

  const [latch, setLatch] = useState<OnboardingGateLatch | null>(null);
  const { decision, latch: nextLatch } = latchOnboardingGate(
    onboardingGateDecision({ pathname, session, remembered, state }),
    latch,
    { pathname, userId: profileId },
  );
  // Verrou mémorisé une fois l'écran réellement affiché (après le rendu).
  const latchPath = nextLatch?.pathname ?? null;
  const latchUser = nextLatch?.userId ?? null;
  useEffect(() => {
    setLatch((prev) =>
      prev?.pathname === latchPath && (prev?.userId ?? null) === latchUser
        ? prev
        : latchPath === null
          ? null
          : { pathname: latchPath, userId: latchUser },
    );
  }, [latchPath, latchUser]);

  const redirecting = decision.kind === "redirect";
  useEffect(() => {
    if (!redirecting) return;
    // `?code=…` d'un lien d'invitation, conservé en `next` (CM-103) : lu au
    // moment de partir (jamais une query périmée après une navigation), et
    // pas par useSearchParams, qui forcerait un <Suspense> autour de toute
    // l'app au build statique.
    const fresh = onboardingGateDecision({
      pathname,
      search: window.location.search,
      session,
      remembered,
      state,
    });
    if (fresh.kind === "redirect") router.replace(fresh.to);
  }, [redirecting, pathname, session, remembered, state, router]);

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
