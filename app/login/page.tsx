import { Suspense } from "react";
import type { Metadata } from "next";
import LoginScreen from "@/components/auth/LoginScreen";
import { ScreenSkeleton } from "@/components/ScreenState";

export const metadata: Metadata = { title: "Connexion · Coach en Muscu" };

// CM-88 (PR 7) : page statique, plus aucune lecture côté serveur. `next` est
// lu dans l'URL par l'écran client (useSearchParams, d'où le <Suspense>), la
// session aussi (compte déjà connecté : renvoyé vers `next`).
export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-[100dvh] flex-col px-6 pb-7 pt-[max(1rem,env(safe-area-inset-top))]">
          <div className="mx-auto mt-14 w-full max-w-sm">
            <ScreenSkeleton label="Chargement" rows={3} />
          </div>
        </main>
      }
    >
      <LoginScreen />
    </Suspense>
  );
}
