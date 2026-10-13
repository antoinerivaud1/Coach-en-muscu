"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  deleteSessionSet,
  finishSession,
  insertStartedSession,
  upsertSessionSet,
} from "@/lib/data/sessionWrites";
import { readBrowserProfileId } from "@/hooks/useProfileId";
import { invalidateSessions } from "@/hooks/data/useSessionScreen";
import { isPublicPath } from "@/lib/auth/publicPaths";
import { outboxCounts, replayOutbox, type OutboxCounts } from "@/lib/offline/outbox";
import { isSessionQueueOwned } from "@/lib/offline/queueOwners";
import { QUEUE_CHANGED_EVENT, queueStore, whenQueuesReady } from "@/lib/offline/queueStore";
import { recordConfirmed } from "@/lib/offline/sessionCache";

/**
 * CM-59 B : pas de rejeu sans session possible : `/login` et les pages
 * publiques (légal, support) ne rejouent jamais la file.
 */
function isSyncablePath(pathname: string | null): boolean {
  if (!pathname) return false;
  if (pathname === "/login" || pathname.startsWith("/login/")) return false;
  return !isPublicPath(pathname);
}

/** Nouvel essai tant qu'il reste quelque chose à envoyer. */
const RETRY_INTERVAL_MS = 30_000;

/**
 * Rejeu de toutes les écritures hors ligne (CM-18, CM-78, CM-90).
 *
 * CM-90 (PR 1) : une seule file ordonnée (lib/offline/outbox.ts) : démarrages
 * de séance, puis séries de chaque séance que l'écran de saisie ne possède
 * pas, puis clôtures. Rejouée au lancement (après la restauration iPhone), au
 * retour du réseau, au retour de l'app au premier plan, et toutes les 30 s
 * tant qu'il reste quelque chose (et à chaque changement d'écran, CM-90
 * PR 4). Une écriture enfin passée fait relire
 * accueil, Carnet et Stats.
 *
 * Indicateur discret sous la barre d'état : écritures en attente (hors séance
 * en cours de saisie, qui a ses propres pastilles) et écritures refusées.
 */
export default function PendingSync() {
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const syncable = isSyncablePath(pathname);
  const [counts, setCounts] = useState<OutboxCounts>({ pending: 0, refused: 0 });
  const running = useRef(false);

  useEffect(() => {
    if (!syncable) return;
    let cancelled = false;
    let ready = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const refreshCounts = () => {
      if (cancelled || !ready) return;
      setCounts(outboxCounts(queueStore(), isSessionQueueOwned));
    };

    async function sync() {
      if (cancelled || !ready || running.current) return;
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
      running.current = true;
      try {
        const supabase = getSupabaseBrowserClient();
        const { written } = await replayOutbox({
          store: queueStore(),
          isOwned: isSessionQueueOwned,
          startSession: (start) => insertStartedSession(supabase, start),
          upsertSet: (set) => upsertSessionSet(supabase, set),
          deleteSet: (input) => deleteSessionSet(supabase, input),
          finishSession: (input) => finishSession(supabase, input),
          onSetConfirmed: (sessionId, op) =>
            recordConfirmed(
              queueStore(),
              sessionId,
              op.kind === "upsert" ? { kind: "upsert", set: op.set } : { kind: "delete", id: op.id },
            ),
        });
        if (written > 0) {
          const profileId = await readBrowserProfileId().catch(() => null);
          if (profileId) void invalidateSessions(queryClient, profileId);
        }
      } finally {
        running.current = false;
      }
      if (cancelled) return;
      const next = outboxCounts(queueStore(), isSessionQueueOwned);
      setCounts(next);
      if (next.pending > 0) timer = setTimeout(() => void sync(), RETRY_INTERVAL_MS);
    }

    const onVisibility = () => {
      if (document.visibilityState === "visible") void sync();
    };

    void whenQueuesReady().then(() => {
      ready = true;
      refreshCounts();
      void sync();
    });
    window.addEventListener("online", sync);
    window.addEventListener(QUEUE_CHANGED_EVENT, refreshCounts);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelled = true;
      if (timer !== null) clearTimeout(timer);
      window.removeEventListener("online", sync);
      window.removeEventListener(QUEUE_CHANGED_EVENT, refreshCounts);
      document.removeEventListener("visibilitychange", onVisibility);
    };
    // CM-90 (PR 4) : relancé à chaque changement d'écran. En quittant la
    // séance, sa file est libérée par l'écran de saisie : si le réseau est
    // revenu entre-temps, elle part tout de suite, pas au prochain essai (30 s).
  }, [pathname, syncable, queryClient]);

  // CM-90 : pas de pastille sur l'écran de séance. Elle recouvrait la frise
  // (chrono, séries) ; le logger affiche lui-même ses séries en attente ou
  // refusées. Le rejeu, lui, continue.
  const onSessionScreen = pathname?.startsWith("/sessions/") ?? false;
  if (!syncable || onSessionScreen || (counts.pending === 0 && counts.refused === 0)) return null;
  return (
    <div
      className="pointer-events-none fixed left-1/2 z-50 flex -translate-x-1/2 flex-col items-center gap-1"
      style={{ top: "max(0.5rem, env(safe-area-inset-top))" }}
    >
      {counts.pending > 0 && (
        <div role="status" className="rounded-full bg-amber-500/90 px-3 py-1 text-sm font-medium text-amber-950">
          {counts.pending} en attente de synchro
        </div>
      )}
      {counts.refused > 0 && (
        <div role="status" className="rounded-full bg-surface2/95 px-3 py-1 text-sm font-medium text-fg-muted">
          {counts.refused} enregistrement{counts.refused > 1 ? "s" : ""} refusé
          {counts.refused > 1 ? "s" : ""} par le serveur
        </div>
      )}
    </div>
  );
}
