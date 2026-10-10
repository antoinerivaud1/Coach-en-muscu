import type { Metadata } from "next";

export const metadata: Metadata = { title: "Bienvenue · Coach en Muscu" };

// CM-86 : cadre commun des étapes d'onboarding (plein écran, sans barre de
// navigation : rien d'autre n'est accessible tant que l'onboarding n'est pas
// terminé, cf. middleware).
export default function OnboardingLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-[100dvh] flex-col px-5 pb-[max(2.25rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))]">
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col">{children}</div>
    </main>
  );
}
