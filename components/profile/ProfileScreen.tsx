"use client";

import { useCallback, useState } from "react";
import { flushSync } from "react-dom";
import Link from "next/link";
import { useRequireProfileId } from "@/hooks/useProfileId";
import { useIdentity } from "@/hooks/data/useIdentity";
import { useBadges } from "@/hooks/data/useBadges";
import { useDuoState } from "@/hooks/data/useDuoState";
import { memberAccent } from "@/lib/members";
import type { Badge } from "@/lib/badges";
import type { DuoState } from "@/lib/queries/duoState";
import type { Identity } from "@/lib/queries/identity";
import IdentitySection from "@/components/profile/IdentitySection";
import SignOutButton from "@/components/SignOutButton";
import MemberAvatar from "@/components/onboarding/MemberAvatar";
import DuoSection from "@/components/profile/DuoSection";
import DataSection from "@/components/profile/DataSection";
import type { DeleteAccountDuo } from "@/components/profile/DeleteAccountSheet";
import { ScreenError, ScreenSkeleton } from "@/components/ScreenState";

function Row({ href, title, sub }: { href: string; title: string; sub: string }) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3.5 rounded-2xl border border-line bg-surface px-4 py-3.5 transition-colors hover:border-white/20"
    >
      <div className="flex-1">
        <div className="font-extrabold text-fg">{title}</div>
        <div className="mt-0.5 text-xs font-semibold text-fg-muted">{sub}</div>
      </div>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5 flex-none text-fg-faint" aria-hidden>
        <path d="m9 18 6-6-6-6" />
      </svg>
    </Link>
  );
}

/**
 * Écran Profil. CM-88 : converti en composant client. Session, identité,
 * badges et état du duo sont lus dans le navigateur, sous RLS ; squelette à
 * la première ouverture.
 *
 * Suppression du compte : dès que la base l'a confirmée, l'écran cesse de
 * suivre la session (`leaving`) AVANT de la fermer. Sinon la fermeture
 * relancerait la lecture de session, qui renverrait vers /login pendant le
 * rechargement vers « Compte supprimé ».
 */
export default function ProfileScreen() {
  const [leaving, setLeaving] = useState(false);
  const onAccountDeleted = useCallback(() => flushSync(() => setLeaving(true)), []);
  if (leaving) {
    return (
      <div className="mt-5">
        <ScreenSkeleton label="Suppression du compte" />
      </div>
    );
  }
  return <ProfileContent onAccountDeleted={onAccountDeleted} />;
}

function ProfileContent({ onAccountDeleted }: { onAccountDeleted: () => void }) {
  const auth = useRequireProfileId("/profile");
  const profileId = auth.profileId;
  const identity = useIdentity(profileId);
  const weeklyGoal = identity.isSuccess ? (identity.data?.weekly_goal ?? 4) : null;
  const badges = useBadges(profileId, weeklyGoal);
  const duo = useDuoState(profileId);

  // Seule une lecture SANS données affiche l'erreur : un rafraîchissement en
  // arrière-plan qui échoue garde l'écran (feuille ouverte, saisie en cours).
  const failedRead = [identity, badges, duo].find((q) => q.error && q.data === undefined);
  const retry =
    auth.error && !profileId
      ? () => void auth.refetch()
      : failedRead
        ? () => void failedRead.refetch()
        : null;
  if (retry) {
    return (
      <div className="mt-5">
        <ScreenError onRetry={retry} />
        <SignOutButton />
      </div>
    );
  }
  if (
    auth.isPending ||
    !profileId ||
    identity.data === undefined ||
    badges.data === undefined ||
    duo.data === undefined
  ) {
    return (
      <div className="mt-5">
        <ScreenSkeleton label="Chargement du profil" />
      </div>
    );
  }

  return (
    <ProfileView
      profileId={profileId}
      identity={identity.data}
      badges={badges.data}
      duo={duo.data}
      onAccountDeleted={onAccountDeleted}
    />
  );
}

function ProfileView({
  profileId,
  identity,
  badges: { badges, earnedCount },
  duo,
  onAccountDeleted,
}: {
  profileId: string;
  identity: Identity | null;
  badges: { badges: Badge[]; earnedCount: number };
  duo: DuoState;
  onAccountDeleted: () => void;
}) {
  // CM-87 : prénom et couleur de membre, état du duo (solo, invitation en
  // attente, en duo).
  const me = {
    id: profileId,
    name: identity?.display_name ?? "",
    color: memberAccent(identity ?? {}),
  };
  const since =
    duo.kind === "duo"
      ? new Intl.DateTimeFormat("fr-FR", {
          timeZone: "Europe/Paris",
          day: "numeric",
          month: "long",
        })
          .format(new Date(duo.since))
          .replace(" ", " ")
      : null;

  // CM-60 : ce que la feuille de suppression annonce (partenaire nommé).
  const deleteDuo: DeleteAccountDuo =
    duo.kind === "duo"
      ? {
          kind: "duo",
          partnerName: duo.partner.display_name,
          partnerColor: memberAccent(duo.partner),
        }
      : duo.kind === "pending"
        ? { kind: "pending" }
        : duo.kind === "error"
          ? { kind: "unknown" }
          : { kind: "solo" };

  return (
    <>
      <div className="mt-5 flex items-center gap-3.5 rounded-3xl border border-line bg-surface p-[18px]">
        <MemberAvatar name={me.name} color={me.color} size={56} />
        <div className="min-w-0">
          <div className="truncate text-[21px] font-black text-fg">{me.name}</div>
          <div className="mt-0.5 text-[15px] text-fg-muted">
            {duo.kind === "duo" ? (
              <>
                En duo avec{" "}
                <span className="font-bold" style={{ color: memberAccent(duo.partner) }}>
                  {duo.partner.display_name}
                </span>{" "}
                depuis le {since}
              </>
            ) : duo.kind === "error" ? null : (
              "Tu t'entraînes en solo"
            )}
          </div>
        </div>
      </div>

      {/* CM-87 : s'entraîner à deux (inviter, rejoindre, quitter). */}
      <DuoSection state={duo} me={me} />

      {/* CM-86 : prénom, couleur et objectif (remplace l'ancien bloc
          « Objectif hebdomadaire » 3 à 6, l'objectif va désormais de 1 à 7).
          CM-103 : en duo, la couleur du partenaire n'est pas proposée. */}
      {identity && (
        <IdentitySection
          profileId={profileId}
          displayName={identity.display_name}
          accentColor={identity.accent_color}
          weeklyGoal={identity.weekly_goal}
          partner={
            duo.kind === "duo"
              ? { name: duo.partner.display_name, color: duo.partner.accent_color }
              : null
          }
        />
      )}

      <div className="mt-6">
        <div className="mb-2.5 flex items-center justify-between">
          <p className="text-[13px] font-extrabold uppercase tracking-[0.16em] text-fg-muted">
            Badges
          </p>
          <span className="text-xs font-semibold text-fg-muted">
            {earnedCount}/{badges.length}
          </span>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {badges.map((b) => (
            <div
              key={b.id}
              className={`flex flex-col items-center gap-1 rounded-2xl border p-3 text-center ${
                b.earned ? "border-energy/40 bg-energy/10" : "border-line bg-surface opacity-60"
              }`}
            >
              <span className="text-2xl">{b.icon}</span>
              <span className={`text-[13px] font-bold leading-tight ${b.earned ? "text-fg" : "text-fg-muted"}`}>
                {b.label}
              </span>
              <span className="text-[12px] text-fg-faint">{b.detail}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-6 flex flex-col gap-2.5">
        <Row href="/guide" title="Guide des exercices" sub="Mouvements, erreurs à éviter, étirements" />
        <Row
          href="/seances"
          title="Mes séances"
          sub="Voir et modifier mes séances types"
        />
      </div>

      {/* CM-60 : export des données et suppression du compte. */}
      <DataSection profileId={profileId} duo={deleteDuo} onAccountDeleted={onAccountDeleted} />

      {/* CM-93 : liens légaux, support et crédits (pages publiques). */}
      <section aria-labelledby="a-propos" className="mt-8">
        <h2
          id="a-propos"
          className="mb-2.5 text-[13px] font-extrabold uppercase tracking-[0.16em] text-fg-muted"
        >
          À propos
        </h2>
        <div className="flex flex-col gap-2.5">
          <Row href="/support" title="Support" sub="Questions fréquentes et contact" />
          <Row href="/legal/confidentialite" title="Confidentialité" sub="Tes données et tes droits" />
          <Row href="/legal/cgu" title="CGU et abonnement" sub="Conditions d’utilisation, Premium" />
          <Row href="/legal/mentions" title="Mentions légales" sub="Éditeur et hébergeurs" />
          <Row href="/credits" title="Crédits et licences" sub="Bibliothèques et polices" />
        </div>
      </section>

      {/* CM-58 : déconnexion (CM-59 B : remplace « Changer de profil », et
          purge les files locales avant de partir). */}
      <SignOutButton />
    </>
  );
}
