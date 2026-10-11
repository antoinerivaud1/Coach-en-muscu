import { Suspense } from "react";
import type { Metadata } from "next";
import ConfirmJoinScreen from "@/components/duo/ConfirmJoinScreen";
import DuoScreen from "@/components/duo/DuoScreen";
import { ScreenSkeleton } from "@/components/ScreenState";

export const metadata: Metadata = { title: "Confirmer le duo · Coach en Muscu" };

// CM-88 (PR 7) : page statique. `code` est lu dans l'URL par l'écran client
// (useSearchParams, d'où le <Suspense>) ; l'aperçu de l'invitation aussi.
export default function ConfirmerPage() {
  return (
    <Suspense
      fallback={
        <DuoScreen backHref="/duo/rejoindre" backLabel="Retour" icon="back">
          <div className="mt-6">
            <ScreenSkeleton label="Chargement de l'invitation" rows={4} />
          </div>
        </DuoScreen>
      }
    >
      <ConfirmJoinScreen />
    </Suspense>
  );
}
