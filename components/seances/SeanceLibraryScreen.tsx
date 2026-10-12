"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useRequireProfileId } from "@/hooks/useProfileId";
import { useSeanceLibrary } from "@/hooks/data/useSeances";
import { useStartSession } from "@/hooks/data/useStartSession";
import { ScreenSkeleton } from "@/components/ScreenState";
import type { Member } from "@/lib/duo";
import SeanceLibrary from "./SeanceLibrary";

/**
 * Bibliothèque « Mes séances » (CM-81).
 *
 * CM-87 : en duo, deux sections. « Nos séances » (programme du duo, visible
 * des deux) puis « Mes séances » (programme perso, visible de moi seul). Sans
 * partenaire, une seule liste : la bibliothèque perso.
 *
 * CM-88 (PR 5) : écran client. Session lue dans le navigateur (renvoi vers
 * `/login?next=%2Fseances`), bibliothèque lue sous RLS (`useSeanceLibrary`),
 * écritures depuis le navigateur. Même rendu que l'ancienne page serveur ; la
 * bibliothèque du duo n'est plus créée à l'affichage (elle l'est par
 * `save_seance` à la première séance enregistrée), une bibliothèque absente
 * s'affiche vide.
 */

const MAIN_CLASS = "min-h-[100dvh] px-5 pb-4 pt-[max(1rem,env(safe-area-inset-top))]";

/** Première ouverture : squelette le temps de la lecture. */
export function SeanceLibraryShell() {
  return (
    <main className={MAIN_CLASS}>
      <div className="mx-auto max-w-lg pt-12">
        <ScreenSkeleton label="Chargement de tes séances" />
      </div>
    </main>
  );
}

/** Cadre commun aux écrans qui n'ont rien à afficher (erreur). */
function Message({
  children,
  onRetry,
}: {
  children: React.ReactNode;
  onRetry?: () => void;
}) {
  return (
    <main className="min-h-screen p-4 pt-[max(1rem,env(safe-area-inset-top))]">
      <div className="mx-auto flex max-w-lg flex-col items-center gap-4 pt-16 text-center">
        {children}
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="rounded-xl bg-energy px-4 py-2.5 text-sm font-extrabold text-ink"
          >
            Réessayer
          </button>
        )}
        <Link
          href="/dashboard"
          className="rounded-xl bg-surface2 px-4 py-2.5 text-sm font-semibold text-fg"
        >
          ← Retour à l&apos;accueil
        </Link>
      </div>
    </main>
  );
}

/** CTA collant, identique sous la liste et sous l'état vide. */
function NewSeanceCta() {
  return (
    <div className="sticky bottom-0 mt-6 bg-ink/90 pt-3 pb-[max(0.5rem,env(safe-area-inset-bottom))] backdrop-blur">
      <Link
        href="/seances/new"
        className="block rounded-2xl bg-energy py-4 text-center text-[18px] font-extrabold text-ink"
      >
        + Nouvelle séance
      </Link>
    </div>
  );
}

function Dot({ member, className = "" }: { member: Member; className?: string }) {
  return (
    <span
      aria-hidden
      className={`h-[18px] w-[18px] rounded-full border-2 border-ink ${className}`}
      style={{ background: member.color }}
    />
  );
}

/** En-tête d'une section de la bibliothèque en duo (maquette 12). */
function SectionHeader({
  id,
  title,
  dots,
  note,
  locked = false,
}: {
  id: string;
  title: string;
  dots: Member[];
  note: string;
  locked?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex flex-none items-center gap-2.5">
        <h2
          id={id}
          className="whitespace-nowrap text-[15px] font-extrabold uppercase tracking-[0.1em] text-fg-muted"
        >
          {title}
        </h2>
        <span className="flex">
          {dots.map((m, i) => (
            <Dot key={m.id} member={m} className={i > 0 ? "-ml-[7px]" : ""} />
          ))}
        </span>
      </div>
      <span className="flex min-w-0 items-center justify-end gap-1.5 text-right text-sm text-fg-muted">
        {locked && (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="h-[13px] w-[13px] flex-none" aria-hidden>
            <rect x="4" y="11" width="16" height="10" rx="2" />
            <path d="M8 11V7a4 4 0 0 1 8 0v4" />
          </svg>
        )}
        {note}
      </span>
    </div>
  );
}

function EmptyLibrary() {
  return (
    <div className="mt-10 flex flex-col items-center text-center">
      <span
        className="flex h-16 w-16 items-center justify-center rounded-[20px] border border-dashed border-line text-3xl font-light text-fg-muted"
        aria-hidden
      >
        +
      </span>
      <h2 className="mt-4 text-balance text-xl font-extrabold text-fg">
        Aucune séance type
      </h2>
      <p className="mt-2 max-w-xs text-balance text-sm text-fg-muted">
        Compose ta première séance&nbsp;: choisis les exercices, elle sera prête
        sur l&apos;accueil à chaque entraînement.
      </p>
    </div>
  );
}

export default function SeanceLibraryScreen() {
  // `error` : message d'une action qui a renvoyé ici (CM-70) ; `info` :
  // message de l'éditeur (CM-87, copie au lieu d'un déplacement).
  const searchParams = useSearchParams();
  const actionError = searchParams.get("error") ?? undefined;
  const info = searchParams.get("info") ?? undefined;

  const auth = useRequireProfileId("/seances");
  const profileId = auth.profileId;
  const library = useSeanceLibrary(profileId);
  const start = useStartSession(profileId);

  if (auth.error) {
    return (
      <Message onRetry={() => void auth.refetch()}>
        <p
          role="alert"
          className="rounded-lg border border-red-400/40 bg-red-400/10 px-3 py-2 text-sm text-red-400"
        >
          Impossible de charger tes séances. Réessaie dans un instant.
        </p>
      </Message>
    );
  }
  if (library.error && !library.data) {
    return (
      <Message onRetry={() => void library.refetch()}>
        <p
          role="alert"
          className="rounded-lg border border-red-400/40 bg-red-400/10 px-3 py-2 text-sm text-red-400"
        >
          {library.error.message}
        </p>
      </Message>
    );
  }
  if (!library.data || !profileId) return <SeanceLibraryShell />;

  const { duoId, members, ours, mine } = library.data;
  const me = members.find((m) => m.isMe);
  const partner = members.find((m) => !m.isMe);
  const total = ours.length + mine.length;
  // Heure du rendu (rendu client seulement), commune aux deux sections
  // (« Hier », « Il y a 6 jours »).
  const now = new Date();

  return (
    <main className={MAIN_CLASS}>
      <div className="mx-auto max-w-lg">
        <Link href="/dashboard" className="inline-flex min-h-11 items-center text-sm text-fg-muted hover:text-fg">
          ‹ Accueil
        </Link>

        <h1 className="mt-1 text-[30px] font-black tracking-tight text-fg">
          {duoId ? "Séances" : "Mes séances"}
        </h1>
        <p className="mt-1 text-sm text-fg-muted">
          {total} séance{total > 1 ? "s" : ""} type
          {total > 1 ? "s" : ""} · réordonne avec les flèches
        </p>

        {actionError && (
          <p
            role="alert"
            className="mt-4 rounded-lg border border-red-400/40 bg-red-400/10 px-3 py-2 text-sm text-red-400"
          >
            {actionError}
          </p>
        )}

        {info && (
          <p
            role="status"
            className="mt-4 text-balance rounded-lg border border-energy/30 bg-energy/10 px-3 py-2.5 text-sm text-fg"
          >
            {info}
          </p>
        )}

        {/* C6 : les deux sections dès que le duo est connu, même si le profil
            du partenaire est illisible (prénom et couleur neutres). */}
        {duoId ? (
          <>
            <section aria-labelledby="nos-seances" className="mt-6">
              <SectionHeader
                id="nos-seances"
                title="Nos séances"
                dots={[me, partner].filter((m): m is Member => Boolean(m))}
                note={partner ? `Partagées avec ${partner.name}` : "Partagées dans ton duo"}
              />
              <div className="mt-2.5">
                {ours.length === 0 ? (
                  <p className="rounded-2xl border border-dashed border-line px-4 py-4 text-sm text-fg-muted">
                    Aucune séance commune pour l&apos;instant.
                  </p>
                ) : (
                  <SeanceLibrary seances={ours} now={now} profileId={profileId} onStart={start} />
                )}
              </div>
            </section>

            <section aria-labelledby="mes-seances" className="mt-7">
              <SectionHeader
                id="mes-seances"
                title="Mes séances"
                dots={me ? [me] : []}
                note="Visibles par toi uniquement"
                locked
              />
              <div className="mt-2.5">
                {mine.length === 0 ? (
                  <p className="text-balance rounded-2xl border border-dashed border-line px-4 py-4 text-sm text-fg-muted">
                    Les séances créées «&nbsp;Pour moi&nbsp;» arrivent ici. {partner?.name ?? "Ton partenaire"} ne les voit pas.
                  </p>
                ) : (
                  <SeanceLibrary
                    seances={mine}
                    now={now}
                    profileId={profileId}
                    onStart={start}
                    // CM-104 : raccourci de partage, seulement avec un partenaire.
                    shareWith={partner ? { name: partner.name, color: partner.color } : undefined}
                  />
                )}
              </div>
            </section>
          </>
        ) : mine.length === 0 ? (
          <EmptyLibrary />
        ) : (
          <div className="mt-5">
            <SeanceLibrary seances={mine} now={now} profileId={profileId} onStart={start} />
          </div>
        )}

        <NewSeanceCta />
      </div>
    </main>
  );
}
