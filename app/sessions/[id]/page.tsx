import { Suspense } from "react";
import SessionScreen from "@/components/session/SessionScreen";
import { ScreenSkeleton } from "@/components/ScreenState";

// CM-88 (PR 6) : plus aucune lecture ni écriture côté serveur. Seul l'id est
// lu dans l'URL ; la séance (saisie ou récap) est lue et écrite dans le
// navigateur, sous RLS. `?edit` et `?editsets` sont lus par l'écran client
// (useSearchParams, d'où le <Suspense>). Le paramètre dynamique reste en
// place jusqu'au routage client des `[id]` (CM-89).
export default async function SessionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
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
      <SessionScreen sessionId={id} />
    </Suspense>
  );
}
