import { Suspense } from "react";
import OnboardingProfileScreen, {
  OnboardingSkeleton,
} from "@/components/onboarding/OnboardingProfileScreen";

// CM-86 : onboarding, étape 2 sur 3. CM-88 (PR 7) : page statique, plus
// aucune lecture côté serveur. `next` (CM-103) est lu dans l'URL par l'écran
// client (useSearchParams, d'où le <Suspense>), le profil aussi.
export default function OnboardingProfilePage() {
  return (
    <Suspense fallback={<OnboardingSkeleton step={2} />}>
      <OnboardingProfileScreen />
    </Suspense>
  );
}
