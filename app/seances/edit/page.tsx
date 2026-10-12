import { Suspense } from "react";
import { SeanceEditFromQuery } from "@/components/seances/SeanceEditorScreen";
import { ScreenSkeleton } from "@/components/ScreenState";

// CM-88 (PR 5) : plus aucune lecture côté serveur. La séance, son accès
// (RLS + contrôle en code) et le catalogue sont lus dans le navigateur.
// CM-89 (PR 2) : page entièrement statique (export Capacitor) : l'id est lu
// en query par l'écran client (useSearchParams, d'où le <Suspense>).
// Ancienne adresse `/seances/<id>/edit` : redirigée sur le web
// (next.config.mjs).
export default function EditSeancePage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen pb-4 pt-[max(1rem,env(safe-area-inset-top))]">
          <div className="mx-auto max-w-lg px-4 pt-14">
            <ScreenSkeleton label="Chargement de la séance" />
          </div>
        </main>
      }
    >
      <SeanceEditFromQuery />
    </Suspense>
  );
}
