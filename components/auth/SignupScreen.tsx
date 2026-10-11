"use client";

import Link from "next/link";
import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { readNextParam, safeNextPath, withNext } from "@/lib/auth/core";
import { signupOpen } from "@/lib/data/auth";
import { useSignedInRedirect } from "@/hooks/useSignedInRedirect";
import StepHeader from "@/components/onboarding/StepHeader";
import SignupForm from "@/components/onboarding/SignupForm";
import { ScreenSkeleton } from "@/components/ScreenState";

/**
 * CM-86 : inscription (maquette 2), étape 1 sur 3 de l'onboarding.
 * CM-103 : `next` (lien d'invitation) conservé jusqu'à la fin de
 * l'onboarding.
 *
 * CM-88 (PR 7) : écran client. Ouverte seulement si
 * `NEXT_PUBLIC_SIGNUP_ENABLED` vaut 1 au BUILD (affichage seulement : la
 * vraie barrière est le réglage Supabase « Allow new users to sign up »,
 * fermé en prod). Fermée par défaut.
 */
export default function SignupScreen() {
  const next = readNextParam(useSearchParams().get("next"));
  const [submitting, setSubmitting] = useState(false);
  const { checking } = useSignedInRedirect(safeNextPath(next), !submitting);
  const open = signupOpen();

  return (
    <SignupFrame next={next}>
      {checking ? (
        <div className="mt-8">
          <ScreenSkeleton label="Vérification de la session" rows={3} />
        </div>
      ) : open ? (
        <>
          <h1 className="mt-8 text-balance text-[30px] font-black leading-[1.1] tracking-tight text-fg">
            Crée ton compte
          </h1>
          <p className="mt-2 text-base leading-snug text-[#A4A4AE]">
            Tes séances sont sauvegardées et te suivent sur tous tes appareils.
          </p>
          <SignupForm next={next} onStart={() => setSubmitting(true)} />
          <p className="mt-4 text-center text-base text-[#A4A4AE]">
            Déjà un compte&nbsp;?{" "}
            <Link href={withNext("/login", next)} className="inline-flex min-h-11 items-center font-bold text-energy">
              Se connecter
            </Link>
          </p>
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
            href={withNext("/login", next)}
            className="mt-8 flex h-14 w-full items-center justify-center rounded-2xl bg-energy text-base font-extrabold text-ink"
          >
            J&apos;ai déjà un compte
          </Link>
        </>
      )}
    </SignupFrame>
  );
}

/** Cadre de l'étape 1 (en-tête et retour vers la bienvenue). */
export function SignupFrame({ next = "", children }: { next?: string; children: React.ReactNode }) {
  return (
    <main className="flex min-h-[100dvh] flex-col px-5 pb-[max(2.25rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))]">
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col">
        <StepHeader step={1} backHref={withNext("/welcome", next)} />
        {children}
      </div>
    </main>
  );
}
