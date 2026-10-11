import { Suspense } from "react";
import OnboardingSeancesScreen from "@/components/onboarding/OnboardingSeancesScreen";
import { OnboardingSkeleton } from "@/components/onboarding/OnboardingProfileScreen";

// CM-86 : onboarding, étape 3 sur 3. CM-88 (PR 7) : page statique, plus
// aucune lecture côté serveur. `next` (CM-103) et `error` sont lus dans l'URL
// par l'écran client (useSearchParams, d'où le <Suspense>), le profil aussi.
export default function OnboardingSeancesPage() {
  return (
    <Suspense fallback={<OnboardingSkeleton step={3} />}>
      <OnboardingSeancesScreen />
    </Suspense>
  );
}
