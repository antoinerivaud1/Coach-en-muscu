import { requireOnboardingIdentity } from "@/lib/onboardingSession";
import { SEANCE_TEMPLATES, templateMeta } from "@/lib/onboardingTemplates";
import StepHeader from "@/components/onboarding/StepHeader";
import TemplatePicker from "@/components/onboarding/TemplatePicker";
import LoadError from "@/components/onboarding/LoadError";

export const dynamic = "force-dynamic";

// CM-86 : onboarding, étape 3 sur 3 (maquette 4 « Par quoi tu commences ? »).
export default async function OnboardingSeancesPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const ctx = await requireOnboardingIdentity("/onboarding/seances");
  if (!ctx.ok) return <LoadError retryHref="/onboarding/seances" />;
  const { identity } = ctx;

  const templates = SEANCE_TEMPLATES.map((t) => ({
    id: t.id,
    label: t.label,
    meta: templateMeta(t),
    seances: t.seances.map((s) => s.name),
  }));

  return (
    <>
      <StepHeader step={3} backHref="/onboarding" />
      <h1 className="mt-7 text-balance text-[30px] font-black leading-[1.1] tracking-tight text-fg">
        Par quoi tu commences, {identity.display_name}&nbsp;?
      </h1>
      <p className="mt-2 text-base leading-snug text-[#A4A4AE]">
        Un modèle prêt à l&apos;emploi, modifiable ensuite.
      </p>
      <TemplatePicker templates={templates} initialError={error} />
    </>
  );
}
