import { requireOnboardingIdentity, prefilledFirstName } from "@/lib/onboardingSession";
import StepHeader from "@/components/onboarding/StepHeader";
import ProfileStepForm from "@/components/onboarding/ProfileStepForm";
import LoadError from "@/components/onboarding/LoadError";

export const dynamic = "force-dynamic";

// CM-86 : onboarding, étape 2 sur 3 (maquette 3 « Prénom et couleur »).
// L'étape 1 est l'inscription : pas de retour possible vers elle, le compte
// existe déjà.
export default async function OnboardingProfilePage() {
  const ctx = await requireOnboardingIdentity("/onboarding");
  if (!ctx.ok) return <LoadError retryHref="/onboarding" />;
  const { identity, email } = ctx;

  return (
    <>
      <StepHeader step={2} />
      <h1 className="mt-7 text-balance text-[30px] font-black leading-[1.1] tracking-tight text-fg">
        Comment on t&apos;appelle&nbsp;?
      </h1>
      <ProfileStepForm
        initialName={prefilledFirstName(identity.display_name, email)}
        initialColor={identity.accent_color}
        initialGoal={identity.weekly_goal}
      />
    </>
  );
}
