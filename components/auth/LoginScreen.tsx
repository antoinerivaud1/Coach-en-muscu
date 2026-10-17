"use client";

import { useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { readNextParam, safeNextPath, withNext } from "@/lib/auth/core";
import { useSignedInRedirect } from "@/hooks/useSignedInRedirect";
import LoginForm from "@/components/LoginForm";
import { ScreenSkeleton } from "@/components/ScreenState";

/**
 * CM-58 : connexion par compte (email + mot de passe). CM-86 : lien vers
 * l'écran de bienvenue (inscription). CM-103 : le `next` suit vers la
 * bienvenue puis l'inscription.
 *
 * CM-88 (PR 7) : écran client. `next` lu dans l'URL (useSearchParams), compte
 * déjà connecté renvoyé vers `next` depuis le navigateur (squelette tant que
 * la session n'est pas connue).
 */
export default function LoginScreen() {
  // CM-103 : `next` demandé (lien d'invitation…), transmis aussi à « Créer un
  // compte » pour le retrouver à la fin de l'onboarding.
  const requested = readNextParam(useSearchParams().get("next"));
  const next = safeNextPath(requested);
  const [submitting, setSubmitting] = useState(false);
  const { checking } = useSignedInRedirect(next, !submitting);

  return (
    <main className="flex min-h-[100dvh] flex-col px-6 pb-7 pt-[max(1rem,env(safe-area-inset-top))]">
      <div className="mx-auto flex w-full max-w-sm flex-1 flex-col">
        <div className="mt-2 flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-[11px] bg-energy font-oswald text-lg font-bold text-energy-fg">
            C
          </span>
          <span className="font-oswald text-sm font-bold uppercase tracking-[0.03em] text-fg">
            Coach en Muscu
          </span>
        </div>

        {checking ? (
          <div className="mt-6">
            <ScreenSkeleton label="Vérification de la session" rows={3} />
          </div>
        ) : (
          <>
            <h1 className="mt-6 text-[40px] font-black leading-[0.95] tracking-tight text-fg">
              Connexion<span className="text-accent">.</span>
            </h1>
            <p className="mt-3 text-sm leading-snug text-fg-muted">
              Entre ton email et ton mot de passe pour retrouver tes séances.
            </p>

            <div className="mt-7">
              <LoginForm next={next} onStart={() => setSubmitting(true)} />
            </div>

            <p className="mt-5 text-center text-base text-fg-muted">
              Pas encore de compte&nbsp;?{" "}
              <Link href={withNext("/welcome", requested)} className="inline-flex min-h-11 items-center font-bold text-accent">
                Créer un compte
              </Link>
            </p>
          </>
        )}

        <LegalLinks />
      </div>
    </main>
  );
}

/** CM-93 : liens légaux, accessibles sans compte. */
export function LegalLinks() {
  return (
    <nav
      aria-label="Informations légales"
      className="mt-auto flex flex-wrap justify-center gap-x-5 gap-y-1 pt-8 text-xs font-medium text-fg-muted"
    >
      <Link href="/legal/confidentialite" className="py-1.5 underline-offset-4 hover:text-fg hover:underline">
        Confidentialité
      </Link>
      <Link href="/legal/cgu" className="py-1.5 underline-offset-4 hover:text-fg hover:underline">
        CGU
      </Link>
      <Link href="/support" className="py-1.5 underline-offset-4 hover:text-fg hover:underline">
        Support
      </Link>
    </nav>
  );
}
