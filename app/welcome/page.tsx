import { Suspense } from "react";
import type { Metadata } from "next";
import WelcomeScreen, { WelcomeFrame, WelcomeSkeleton } from "@/components/auth/WelcomeScreen";

export const metadata: Metadata = { title: "Bienvenue · Coach en Muscu" };

// CM-86 : écran de bienvenue. CM-88 (PR 7) : page statique, `next` et la
// session sont lus par l'écran client (useSearchParams, d'où le <Suspense>).
export default function WelcomePage() {
  return (
    <Suspense
      fallback={
        <WelcomeFrame>
          <WelcomeSkeleton />
        </WelcomeFrame>
      }
    >
      <WelcomeScreen />
    </Suspense>
  );
}
