"use client";

import { useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useRequireProfileId } from "@/hooks/useProfileId";
import { useSessionScreen } from "@/hooks/data/useSessionScreen";
import { ScreenError, ScreenSkeleton } from "@/components/ScreenState";
import { memberAccent } from "@/lib/members";
import { memberStyle } from "@/lib/duo";
import type { LoggerData } from "@/lib/data/sessionDetail";
import SessionLogger from "./SessionLogger";
import SessionRecap from "./SessionRecap";

/**
 * Écran d'une séance (`/sessions/[id]`). CM-88 (PR 6) : lu et écrit dans le
 * navigateur, sous RLS. Deux modes, choisis par les données :
 * - saisie (`SessionLogger`) : ma séance en cours, ou ma séance terminée
 *   rouverte par « Modifier » (`?edit=1`) ;
 * - récap (`SessionRecap`) : séance terminée, la mienne (`?editsets=1` pour
 *   corriger les séries) ou celle de mon partenaire de duo.
 *
 * Lit `?edit` et `?editsets` avec `useSearchParams` : la page l'entoure d'un
 * `<Suspense>`.
 *
 * Saisie ÉPINGLÉE : une fois le logger affiché, plus rien ne le démonte en
 * pleine séance (jeton à rafraîchir sans réseau, relecture qui échoue ou qui
 * revient « introuvable », session fermée) : il perdrait ses saisies en
 * cours, et se remonterait sur une lecture d'avant les séries déjà écrites.
 * Seule la fin de séance réussie (`onFinished`) ou un changement d'adresse
 * le libère.
 */

type Pin =
  /** Logger affiché pour `key`, sur cette lecture. */
  | { key: string; data: LoggerData; profileId: string }
  /** Séance terminée depuis ce logger : on attend la relecture du récap. */
  | { key: string; data: null; profileId: string };

export default function SessionScreen({ sessionId }: { sessionId: string }) {
  const params = useSearchParams();
  const edit = params.get("edit") === "1";
  const editSets = !edit && params.get("editsets") === "1";
  const pinKey = `${sessionId}:${edit ? "edit" : "run"}`;

  const [pin, setPin] = useState<Pin | null>(null);
  // Autre adresse (autre séance, « Modifier », retour arrière) : l'épingle
  // ne vaut plus. Jamais réutilisée, elle rouvrirait une saisie sur une
  // lecture périmée, ou bloquerait l'écran en attente d'un récap.
  if (pin && pin.key !== pinKey) setPin(null);
  const livePin = pin?.key === pinKey ? pin : null;

  const next = `/sessions/${sessionId}${edit ? "?edit=1" : editSets ? "?editsets=1" : ""}`;
  const auth = useRequireProfileId(next, { redirect: !livePin?.data });
  const profileId = auth.profileId;
  const screen = useSessionScreen(profileId, sessionId, edit);

  // Épinglage : seulement sur une lecture faite APRÈS l'ouverture de l'écran
  // (jamais un cache), et une seule fois par adresse. Mise à jour d'état
  // pendant le rendu, gardée : React la recommande pour un état dérivé.
  if (
    !livePin &&
    profileId &&
    screen.data?.kind === "logger" &&
    screen.isFetchedAfterMount &&
    !screen.isFetching
  ) {
    setPin({ key: pinKey, data: screen.data, profileId });
  }

  if (livePin?.data) {
    return (
      <LoggerHost
        key={pinKey}
        data={livePin.data}
        profileId={livePin.profileId}
        editMode={edit}
        onFinished={() => setPin({ key: pinKey, data: null, profileId: livePin.profileId })}
      />
    );
  }

  const data = screen.data;
  // Après « Terminer » : seul un récap relu convient. La lecture d'avant
  // (encore « saisie ») ne doit pas rouvrir le logger d'une séance terminée.
  const waitingRecap = livePin !== null && data?.kind === "logger";

  if (auth.error || (screen.error && (!data || waitingRecap))) {
    return (
      <Frame>
        <ScreenError
          onRetry={() => void (auth.error ? auth.refetch() : screen.refetch())}
        />
      </Frame>
    );
  }
  if (!profileId || !data || waitingRecap || (data.kind === "logger" && !livePin)) {
    return (
      <Frame>
        <ScreenSkeleton label="Chargement de la séance" />
      </Frame>
    );
  }

  if (data.kind === "notFound") {
    return (
      <main className="min-h-screen p-4 pt-[max(1rem,env(safe-area-inset-top))]">
        <div className="mx-auto flex max-w-lg flex-col items-center gap-4 pt-16 text-center">
          <h1 className="text-xl font-extrabold text-fg">Séance introuvable</h1>
          <p className="text-sm text-fg-muted">
            Cette séance n&apos;existe pas ou n&apos;est pas accessible depuis ton compte.
          </p>
          <Link
            href="/history"
            className="rounded-xl bg-surface2 px-4 py-2.5 text-sm font-semibold text-fg"
          >
            Retour à l&apos;historique
          </Link>
        </div>
      </main>
    );
  }

  if (data.kind === "logger") return null; // Inatteignable : épinglé ci-dessus.

  return <SessionRecap data={data} profileId={profileId} editSets={editSets} />;
}

function LoggerHost({
  data,
  profileId,
  editMode,
  onFinished,
}: {
  data: LoggerData;
  profileId: string;
  editMode: boolean;
  onFinished: () => void;
}) {
  return (
    <main
      className="min-h-screen p-4"
      style={memberStyle(memberAccent({ accent_color: data.ownerAccent }))}
    >
      <SessionLogger
        profileId={profileId}
        sessionId={data.sessionId}
        dayName={data.dayName}
        startedAt={data.startedAt}
        finishedDurationSeconds={data.finishedDurationSeconds}
        initialFeedback={data.initialFeedback}
        exercises={data.exercises}
        initialSets={data.initialSets}
        catalog={data.catalog}
        canCreateExercise={data.canCreateExercise}
        editMode={editMode}
        onFinished={onFinished}
      />
    </main>
  );
}

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen p-4 pt-[max(1rem,env(safe-area-inset-top))]">
      <div className="mx-auto max-w-lg pt-10">{children}</div>
    </main>
  );
}
