"use client";

import { useSearchParams } from "next/navigation";
import { prefilledFirstName } from "@/lib/onboardingSession";
import { readNextParam, withNext } from "@/lib/auth/core";
import { useOnboardingContext } from "@/hooks/data/useOnboardingContext";
import StepHeader from "@/components/onboarding/StepHeader";
import ProfileStepForm from "@/components/onboarding/ProfileStepForm";
import LoadError from "@/components/onboarding/LoadError";
import { ScreenSkeleton } from "@/components/ScreenState";

/**
 * CM-86 : onboarding, étape 2 sur 3 (maquette 3 « Prénom et couleur »).
 * L'étape 1 est l'inscription : pas de retour possible vers elle, le compte
 * existe déjà. CM-103 : `next` (lien d'invitation) transmis à l'étape 3.
 * CM-88 (PR 7) : écran client, profil lu dans le navigateur.
 */
export default function OnboardingProfileScreen() {
  const next = readNextParam(useSearchParams().get("next"));
  const here = withNext("/onboarding", next);
  const ctx = useOnboardingContext(here, next);
  if (ctx.status === "error") return <LoadError retryHref={here} />;
  if (ctx.status === "loading") return <OnboardingSkeleton step={2} />;
  const { identity, email } = ctx;

  return (
    <>
      <StepHeader step={2} />
      <h1 className="mt-7 text-balance text-[30px] font-black leading-[1.1] tracking-tight text-fg">
        Comment on t&apos;appelle&nbsp;?
      </h1>
      <ProfileStepForm
        profileId={ctx.profileId}
        initialName={prefilledFirstName(identity.display_name, email)}
        initialColor={identity.accent_color}
        initialGoal={identity.weekly_goal}
        next={next}
      />
    </>
  );
}

/** Étape en cours de chargement (première ouverture). */
export function OnboardingSkeleton({ step }: { step: 2 | 3 }) {
  return (
    <>
      <StepHeader step={step} />
      <div className="mt-7">
        <ScreenSkeleton label="Chargement de ton profil" rows={4} />
      </div>
    </>
  );
}
