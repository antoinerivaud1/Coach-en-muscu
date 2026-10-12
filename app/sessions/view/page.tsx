import { Suspense } from "react";
import SessionScreen from "@/components/session/SessionScreen";
import { ScreenSkeleton } from "@/components/ScreenState";

// CM-88 (PR 6) : plus aucune lecture ni écriture côté serveur. La séance
// (saisie ou récap) est lue et écrite dans le navigateur, sous RLS.
// CM-89 (PR 2) : page entièrement statique (export Capacitor) : l'id, `?edit`
// et `?editsets` sont lus en query par l'écran client (useSearchParams, d'où
// le <Suspense>). Ancienne adresse `/sessions/<id>` : redirigée sur le web
// (next.config.mjs).
export default function SessionPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen p-4 pt-[max(1rem,env(safe-area-inset-top))]">
          <div className="mx-auto max-w-lg pt-10">
            <ScreenSkeleton label="Chargement de la séance" />
          </div>
        </main>
      }
    >
      <SessionScreen />
    </Suspense>
  );
}
