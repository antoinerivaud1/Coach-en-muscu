import { Suspense } from "react";
import type { Metadata } from "next";
import SignupScreen, { SignupFrame } from "@/components/auth/SignupScreen";
import { ScreenSkeleton } from "@/components/ScreenState";

export const metadata: Metadata = { title: "Créer un compte · Coach en Muscu" };

// CM-86 : inscription, étape 1 sur 3. CM-88 (PR 7) : page statique.
// L'ouverture dépend de `NEXT_PUBLIC_SIGNUP_ENABLED`, lue au BUILD (et non
// plus `SIGNUP_ENABLED` à l'exécution) ; `next` et la session sont lus par
// l'écran client (useSearchParams, d'où le <Suspense>).
export default function SignupPage() {
  return (
    <Suspense
      fallback={
        <SignupFrame>
          <div className="mt-8">
            <ScreenSkeleton label="Chargement" rows={3} />
          </div>
        </SignupFrame>
      }
    >
      <SignupScreen />
    </Suspense>
  );
}
