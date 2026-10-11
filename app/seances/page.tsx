import { Suspense } from "react";
import SeanceLibraryScreen, { SeanceLibraryShell } from "@/components/seances/SeanceLibraryScreen";

// CM-88 (PR 5) : plus aucune lecture côté serveur. La bibliothèque lit la
// session et ses données dans le navigateur (SeanceLibraryScreen), sous RLS.
// `<Suspense>` : `?error=` et `?info=` sont lus par `useSearchParams`, la
// route reste statique.
export default function SeancesPage() {
  return (
    <Suspense fallback={<SeanceLibraryShell />}>
      <SeanceLibraryScreen />
    </Suspense>
  );
}
