import { requireOnboardingIdentity } from "@/lib/onboardingSession";
import { readNextParam, withNext } from "@/lib/auth/core";
import { invitationCodeFromPath } from "@/lib/onboarding";
import { SEANCE_TEMPLATES, templateMeta } from "@/lib/onboardingTemplates";
import StepHeader from "@/components/onboarding/StepHeader";
import TemplatePicker from "@/components/onboarding/TemplatePicker";
import LoadError from "@/components/onboarding/LoadError";

export const dynamic = "force-dynamic";

// CM-86 : onboarding, étape 3 sur 3 (maquette 4 « Par quoi tu commences ? »).
// CM-103 : arrivé par un lien d'invitation (`next`), l'invité garde le choix
// des modèles (facultatif, comme un solo) puis termine sur la confirmation de
// l'invitation.
export default async function OnboardingSeancesPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string | string[] }>;
}) {
  const { error, next: rawNext } = await searchParams;
  const next = readNextParam(rawNext);
  const invited = invitationCodeFromPath(next) !== null;
  const here = withNext("/onboarding/seances", next);
  const ctx = await requireOnboardingIdentity(here, next);
  if (!ctx.ok) return <LoadError retryHref={here} />;
  const { identity } = ctx;

  const templates = SEANCE_TEMPLATES.map((t) => ({
    id: t.id,
    label: t.label,
    meta: templateMeta(t),
    seances: t.seances.map((s) => s.name),
  }));

  return (
    <>
      <StepHeader step={3} backHref={withNext("/onboarding", next)} />
      <h1 className="mt-7 text-balance text-[30px] font-black leading-[1.1] tracking-tight text-fg">
        Par quoi tu commences, {identity.display_name}&nbsp;?
      </h1>
      <p className="mt-2 text-base leading-snug text-[#A4A4AE]">
        Un modèle prêt à l&apos;emploi, modifiable ensuite.
      </p>
      {invited && (
        <div
          role="note"
          aria-label="Invitation en attente"
          className="mt-5 flex items-start gap-3 rounded-[18px] border-[1.5px] border-energy/35 bg-energy/[0.06] px-4 py-3.5"
        >
          <span
            aria-hidden
            className="mt-0.5 flex h-[26px] w-[26px] flex-none items-center justify-center rounded-lg bg-energy/[0.14] text-energy"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
              <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
              <path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
          </span>
          <span className="text-balance text-base leading-snug text-[#E4E4EA]">
            <span className="font-bold text-fg">Ton invitation t&apos;attend.</span>{" "}
            Ajoute un modèle ou passe cette étape&nbsp;: tu confirmes ensuite ton duo.
          </span>
        </div>
      )}
      <TemplatePicker templates={templates} initialError={error} next={next} invited={invited} />
    </>
  );
}
