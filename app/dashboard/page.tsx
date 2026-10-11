import { Suspense } from "react";
import DashboardScreen, { DashboardShell } from "@/components/home/DashboardScreen";

// CM-88 (PR 4) : plus aucune lecture côté serveur. L'accueil lit la session et
// ses données dans le navigateur (DashboardScreen), sous RLS. `<Suspense>` :
// `?error=` est lu par `useSearchParams`, la route reste statique.
export default function DashboardPage() {
  return (
    <Suspense fallback={<DashboardShell />}>
      <DashboardScreen />
    </Suspense>
  );
}
