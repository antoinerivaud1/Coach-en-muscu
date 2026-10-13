"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useRequireProfileId } from "@/hooks/useProfileId";
import { useSessionScreen } from "@/hooks/data/useSessionScreen";
import { ScreenError, ScreenSkeleton } from "@/components/ScreenState";
import { memberAccent } from "@/lib/members";
import { memberStyle } from "@/lib/duo";
import type { LoggerData } from "@/lib/data/sessionDetail";
import { isUuid } from "@/lib/auth/core";
import { sessionPath } from "@/lib/routes";
import SessionLogger from "./SessionLogger";
import SessionRecap from "./SessionRecap";
import { hasPendingStart } from "@/lib/offline/pendingStarts";
import { queueStore, whenQueuesReady } from "@/lib/offline/queueStore";
import {
  dropActiveSession,
  readActiveSession,
  saveActiveSession,
} from "@/lib/offline/sessionCache";

/**
 * Écran d'une séance (`/sessions/view?id=<uuid>`). CM-88 (PR 6) : lu et
 * écrit dans le navigateur, sous RLS. Deux modes, choisis par les données :
 * - saisie (`SessionLogger`) : ma séance en cours, ou ma séance terminée
 *   rouverte par « Modifier » (`?edit=1`) ;
 * - récap (`SessionRecap`) : séance terminée, la mienne (`?editsets=1` pour
 *   corriger les séries) ou celle de mon partenaire de duo.
 *
 * Lit `?id`, `?edit` et `?editsets` avec `useSearchParams` : la page
 * l'entoure d'un `<Suspense>`. CM-89 (PR 2) : l'id passe en query (plus de
 * `[id]`, export statique Capacitor).
 *
 * Saisie ÉPINGLÉE : une fois le logger affiché, plus rien ne le démonte en
 * pleine séance (jeton à rafraîchir sans réseau, relecture qui échoue ou qui
 * revient « introuvable », session fermée) : il perdrait ses saisies en
 * cours, et se remonterait sur une lecture d'avant les séries déjà écrites.
 * Seule la fin de séance réussie (`onFinished`) ou un changement d'adresse
 * le libère.
 *
 * CM-90 (PR 2) : hors ligne. Chaque lecture d'une séance en cours est
 * gardée sur le téléphone (lib/offline/sessionCache.ts). Sans réseau (ou
 * pour une séance démarrée hors ligne, pas encore créée en base), le logger
 * s'ouvre sur cette copie, plus les séries confirmées depuis ; les séries
 * encore en file sont rajoutées par le logger lui-même (CM-78).
 */

type Pin =
  /** Logger affiché pour `key`, sur cette lecture (ou sur la copie locale). */
  | { key: string; data: LoggerData; profileId: string; fromCache?: boolean }
  /** Séance terminée depuis ce logger : on attend la relecture du récap. */
  | { key: string; data: null; profileId: string };

export default function SessionScreen() {
  const params = useSearchParams();
  const id = params.get("id");
  const edit = params.get("edit") === "1";
  const editSets = !edit && params.get("editsets") === "1";
  // CM-89 (PR 2) : id absent ou mal formé, aucune lecture : « Séance
  // introuvable » tout de suite (la base refuserait un uuid invalide, et
  // l'écran afficherait une erreur réseau trompeuse).
  if (!isUuid(id)) return <SessionNotFound />;
  // `key` : une autre séance remonte l'écran, comme quand l'id était un
  // segment d'adresse. `?edit` / `?editsets` restent gérés par l'épingle.
  return <SessionView key={id} sessionId={id} edit={edit} editSets={editSets} />;
}

function SessionView({
  sessionId,
  edit,
  editSets,
}: {
  sessionId: string;
  edit: boolean;
  editSets: boolean;
}) {
  const pinKey = `${sessionId}:${edit ? "edit" : "run"}`;

  const [pin, setPin] = useState<Pin | null>(null);
  // CM-90 (PR 2) : copie locale de la séance et démarrage en attente, lus
  // après la restauration des files (iPhone). `undefined` : pas encore lus.
  const [local, setLocal] = useState<
    { snapshot: { profileId: string; data: LoggerData } | null; pendingStart: boolean } | undefined
  >(undefined);
  useEffect(() => {
    let active = true;
    void whenQueuesReady().then(() => {
      if (!active) return;
      const store = queueStore();
      setLocal({
        // « Modifier » une séance terminée : toujours en ligne.
        snapshot: edit ? null : readActiveSession(store, sessionId, null),
        pendingStart: hasPendingStart(store, sessionId),
      });
    });
    return () => {
      active = false;
    };
  }, [sessionId, edit]);
  // Autre adresse (autre séance, « Modifier », retour arrière) : l'épingle
  // ne vaut plus. Jamais réutilisée, elle rouvrirait une saisie sur une
  // lecture périmée, ou bloquerait l'écran en attente d'un récap.
  if (pin && pin.key !== pinKey) setPin(null);
  const livePin = pin?.key === pinKey ? pin : null;

  const next = sessionPath(sessionId, { edit, editSets });
  const auth = useRequireProfileId(next, { redirect: !livePin?.data });
  const profileId = auth.profileId;
  const screen = useSessionScreen(profileId, sessionId, edit);

  // CM-90 (PR 2) : copie locale utilisable (même compte, s'il est connu).
  const cached =
    local?.snapshot && (!profileId || local.snapshot.profileId === profileId)
      ? local.snapshot
      : null;
  // Séance démarrée hors ligne (pas encore en base), ou lecture impossible :
  // on ouvre la copie locale. Jamais pour un « introuvable » sans démarrage
  // en attente : la séance a pu être supprimée ailleurs.
  if (!livePin && cached && (local?.pendingStart || auth.error || screen.error)) {
    setPin({ key: pinKey, data: cached.data, profileId: cached.profileId, fromCache: true });
  }

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
        saveLocal={!edit && !livePin.fromCache}
        onFinished={() => {
          dropActiveSession(queueStore(), sessionId);
          setPin({ key: pinKey, data: null, profileId: livePin.profileId });
        }}
      />
    );
  }

  // Copie locale pas encore lue : rien de définitif à afficher (surtout pas
  // « introuvable » pour une séance démarrée hors ligne).
  if (local === undefined) {
    return (
      <Frame>
        <ScreenSkeleton label="Chargement de la séance" />
      </Frame>
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

  if (data.kind === "notFound") return <SessionNotFound />;

  if (data.kind === "logger") return null; // Inatteignable : épinglé ci-dessus.

  return <SessionRecap data={data} profileId={profileId} editSets={editSets} />;
}

function SessionNotFound() {
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

function LoggerHost({
  data,
  profileId,
  editMode,
  saveLocal,
  onFinished,
}: {
  data: LoggerData;
  profileId: string;
  editMode: boolean;
  /** CM-90 (PR 2) : garder cette lecture pour une réouverture hors ligne. */
  saveLocal: boolean;
  onFinished: () => void;
}) {
  // Une fois par lecture épinglée : copie locale de la séance en cours.
  useEffect(() => {
    if (!saveLocal || data.finishedDurationSeconds !== null) return;
    saveActiveSession(queueStore(), profileId, data, Date.now());
  }, [saveLocal, data, profileId]);

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
