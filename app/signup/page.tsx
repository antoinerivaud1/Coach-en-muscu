import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getAuthState } from "@/lib/profile";
import { isSignupEnabled } from "@/lib/onboarding";
import StepHeader from "@/components/onboarding/StepHeader";
import SignupForm from "@/components/onboarding/SignupForm";

export const metadata: Metadata = { title: "Créer un compte · Coach en Muscu" };
// `SIGNUP_ENABLED` est lue à l'exécution (pas au build).
export const dynamic = "force-dynamic";

// CM-86 : inscription (maquette 2), étape 1 sur 3 de l'onboarding. Fermée
// par défaut (`SIGNUP_ENABLED`) : l'app n'est pas encore publique.
export default async function SignupPage() {
  const { profileId } = await getAuthState();
  if (profileId) redirect("/dashboard");
  const open = isSignupEnabled(process.env.SIGNUP_ENABLED);

  return (
    <main className="flex min-h-[100dvh] flex-col px-5 pb-[max(2.25rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))]">
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col">
        <StepHeader step={1} backHref="/welcome" />

        {open ? (
          <>
            <h1 className="mt-8 text-balance text-[30px] font-black leading-[1.1] tracking-tight text-fg">
              Crée ton compte
            </h1>
            <p className="mt-2 text-base leading-snug text-[#A4A4AE]">
              Tes séances sont sauvegardées et te suivent sur tous tes appareils.
            </p>
            <SignupForm />
          </>
        ) : (
          <>
            <h1 className="mt-8 text-balance text-[30px] font-black leading-[1.1] tracking-tight text-fg">
              Les inscriptions ouvriront bientôt
            </h1>
            <p className="mt-2 text-base leading-snug text-[#A4A4AE]">
              Coach en Muscu est encore en phase de test. Tu as déjà un compte&nbsp;?
              Connecte-toi pour retrouver tes séances.
            </p>
            <div className="flex-1" />
            <Link
              href="/login"
              className="mt-8 flex h-14 w-full items-center justify-center rounded-2xl bg-energy text-base font-extrabold text-ink"
            >
              J&apos;ai déjà un compte
            </Link>
          </>
        )}

        {open && (
          <p className="mt-4 text-center text-base text-[#A4A4AE]">
            Déjà un compte&nbsp;?{" "}
            <Link href="/login" className="inline-flex min-h-11 items-center font-bold text-energy">
              Se connecter
            </Link>
          </p>
        )}
      </div>
    </main>
  );
}
