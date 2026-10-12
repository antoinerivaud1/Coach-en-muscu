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
 */
export default function SessionScreen({ sessionId }: { sessionId: string }) {
  const params = useSearchParams();
  const edit = params.get("edit") === "1";
  const editSets = !edit && params.get("editsets") === "1";

  const auth = useRequireProfileId(`/sessions/${sessionId}`);
  const profileId = auth.profileId;
  const screen = useSessionScreen(profileId, sessionId, edit);

  if (auth.error || (!screen.data && screen.error)) {
    return (
      <Frame>
        <ScreenError
          onRetry={() => void (auth.error ? auth.refetch() : screen.refetch())}
        />
      </Frame>
    );
  }
  if (!profileId || !screen.data) {
    return (
      <Frame>
        <ScreenSkeleton label="Chargement de la séance" />
      </Frame>
    );
  }

  const data = screen.data;
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

  if (data.kind === "logger") {
    // Nouvelle instance pour une autre séance ou un autre mode.
    return <LoggerHost key={`${sessionId}:${edit ? "edit" : "run"}`} data={data} profileId={profileId} />;
  }

  return <SessionRecap data={data} profileId={profileId} editSets={editSets} />;
}

/**
 * Le logger s'initialise UNE fois (séries saisies, file hors ligne,
 * exercices ajoutés) : il reçoit la PREMIÈRE lecture, figée. Une relecture
 * ultérieure (fin de séance, réseau retrouvé) ne doit ni remonter ses états
 * ni relancer la reprise de la file. Quand la séance passe terminée, la
 * relecture donne un récap et ce composant est démonté.
 */
function LoggerHost({ data, profileId }: { data: LoggerData; profileId: string }) {
  const [initial] = useState(data);
  return (
    <main
      className="min-h-screen p-4"
      style={memberStyle(memberAccent({ accent_color: initial.ownerAccent }))}
    >
      <SessionLogger
        profileId={profileId}
        sessionId={initial.sessionId}
        dayName={initial.dayName}
        startedAt={initial.startedAt}
        finishedDurationSeconds={initial.finishedDurationSeconds}
        initialFeedback={initial.initialFeedback}
        exercises={initial.exercises}
        initialSets={initial.initialSets}
        catalog={initial.catalog}
        canCreateExercise={initial.canCreateExercise}
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
