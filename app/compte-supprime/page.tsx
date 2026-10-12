import type { Metadata } from "next";
import Link from "next/link";
import PurgeLocalQueues from "@/components/profile/PurgeLocalQueues";

export const metadata: Metadata = { title: "Compte supprimé · Coach en Muscu" };

// CM-60 : page affichée après « Supprimer mon compte ». Publique
// (lib/auth/publicPaths.ts) : la session vient d'être fermée. Aucune donnée
// lue.
// CM-89 (PR 3) : page statique (export natif). Plus de lecture des cookies
// côté serveur : `PurgeLocalQueues` regarde la session dans le navigateur
// et vide les files locales s'il n'y en a plus.
export default function AccountDeletedPage() {
  return (
    <main className="flex min-h-[100dvh] flex-col px-6 pb-[max(2.5rem,env(safe-area-inset-bottom))] pt-[max(1.5rem,env(safe-area-inset-top))]">
      <PurgeLocalQueues />
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col">
        <div className="mt-6 flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-energy" aria-hidden>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#0B0B0F" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="m6.5 6.5 11 11" /><path d="m21 21-1-1" /><path d="m3 3 1 1" /><path d="m18 22 4-4" /><path d="m2 6 4-4" /><path d="m3 10 7-7" /><path d="m14 21 7-7" />
            </svg>
          </span>
          <span className="text-base font-extrabold tracking-[0.02em] text-fg">COACH EN MUSCU</span>
        </div>

        <div className="flex-1" />

        <span
          aria-hidden
          className="flex h-14 w-14 items-center justify-center rounded-2xl bg-surface2 text-fg"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className="h-7 w-7">
            <path d="M20 6 9 17l-5-5" />
          </svg>
        </span>
        <h1 className="mt-5 text-balance font-oswald text-[46px] font-bold uppercase leading-[1.08] tracking-[-0.01em] text-fg">
          Ton compte est supprimé.
        </h1>
        <p className="mt-4 text-balance text-base leading-relaxed text-[#A4A4AE]">
          Ton profil, tes séances, tes séries, tes séances types et tes exercices perso ont
          été effacés, et la session est fermée sur ce téléphone.
        </p>
        <ul className="mt-5 flex flex-col gap-3 text-balance text-base leading-snug text-[#C9C9D1]">
          <li className="flex gap-3">
            <span aria-hidden className="mt-[9px] h-1.5 w-1.5 flex-none rounded-full bg-energy" />
            Si tu étais en duo, ton partenaire garde ses séances et la bibliothèque du duo.
          </li>
          <li className="flex gap-3">
            <span aria-hidden className="mt-[9px] h-1.5 w-1.5 flex-none rounded-full bg-energy" />
            Un abonnement Premium se résilie à part, dans les réglages de ton identifiant
            Apple.
          </li>
        </ul>

        <div className="mt-9 flex flex-col gap-2.5">
          <Link
            href="/welcome"
            className="flex h-14 w-full items-center justify-center rounded-2xl bg-energy text-base font-extrabold text-ink"
          >
            Revenir à l&apos;accueil
          </Link>
          <Link
            href="/support"
            className="flex h-12 w-full items-center justify-center text-base font-semibold text-fg"
          >
            Une question&nbsp;? Contacter le support
          </Link>
        </div>
      </div>
    </main>
  );
}
