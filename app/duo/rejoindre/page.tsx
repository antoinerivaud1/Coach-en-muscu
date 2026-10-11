import { Suspense } from "react";
import type { Metadata } from "next";
import JoinScreen from "@/components/duo/JoinScreen";
import DuoScreen from "@/components/duo/DuoScreen";
import { ScreenSkeleton } from "@/components/ScreenState";

export const metadata: Metadata = { title: "Rejoindre un duo · Coach en Muscu" };

// CM-88 (PR 7) : page statique. `code` et `erreur` sont lus dans l'URL par
// l'écran client (useSearchParams, d'où le <Suspense>), la session aussi.
export default function RejoindrePage() {
  return (
    <Suspense
      fallback={
        <DuoScreen backHref="/profile" backLabel="Retour" icon="back">
          <div className="mt-6">
            <ScreenSkeleton label="Chargement" rows={3} />
          </div>
        </DuoScreen>
      }
    >
      <JoinScreen />
    </Suspense>
  );
}
