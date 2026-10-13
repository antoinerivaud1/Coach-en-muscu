"use client";

import { useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { queryKeys } from "@/lib/data/queryKeys";
import { startSessionFromDay, type StartSessionResult } from "@/lib/data/sessionStart";
import { addPendingStart } from "@/lib/offline/pendingStarts";
import { queueStore } from "@/lib/offline/queueStore";
import { offlineSessionFromPack, readPack, saveActiveSession } from "@/lib/offline/sessionCache";
import { newSetId } from "@/lib/utils/setQueue";
import { sessionPath } from "@/lib/routes";

/**
 * CM-90 (PR 2) : au-delà de ce délai sans réponse, on démarre hors ligne (même
 * id : si la requête finit par passer, le rejeu ne crée rien de plus).
 */
const ONLINE_START_TIMEOUT_MS = 8000;

export const OFFLINE_NO_PACK_MESSAGE =
  "Pas de réseau, et cette séance n'est pas encore prête hors ligne. Ouvre l'accueil une fois connecté, puis réessaie.";

/**
 * CM-90 (PR 2) : démarrage SANS réseau, depuis le pack séance préparé en
 * ligne. La séance existe tout de suite sur le téléphone (id local) ; sa
 * création en base part dans la file (`cm_pending_starts`), avant ses séries.
 */
function startOffline(profileId: string, dayId: string, sessionId: string): StartSessionResult {
  const store = queueStore();
  const pack = readPack(store, profileId, dayId);
  if (!pack) return { ok: false, error: OFFLINE_NO_PACK_MESSAGE };
  const performedAt = new Date().toISOString();
  saveActiveSession(store, profileId, offlineSessionFromPack(pack, sessionId, performedAt), Date.now());
  addPendingStart(store, { sessionId, profileId, programDayId: dayId, performedAt });
  return { ok: true, sessionId };
}

function withTimeout<T>(promise: Promise<T>, ms: number, onTimeout: T): Promise<T> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(onTimeout), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      () => {
        clearTimeout(timer);
        resolve(onTimeout);
      },
    );
  });
}

async function startSession(profileId: string, dayId: string): Promise<StartSessionResult> {
  const sessionId = newSetId();
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return startOffline(profileId, dayId, sessionId);
  }
  const offline: StartSessionResult = { ok: false, error: "Hors ligne", offline: true };
  const online = await withTimeout(
    startSessionFromDay(getSupabaseBrowserClient(), profileId, dayId, sessionId),
    ONLINE_START_TIMEOUT_MS,
    offline,
  );
  if (online.ok || !online.offline) return online;
  return startOffline(profileId, dayId, sessionId);
}

/**
 * CM-88 (PR 4) : « Démarrer une séance » depuis l'accueil (grille, suggestion,
 * accueil du premier jour) et, depuis la PR 5, depuis la bibliothèque
 * `/seances`. Succès → `sessionPath(<id>)` ; échec → `/dashboard?error=…`, le
 * message s'affiche en haut de l'accueil (CM-70).
 *
 * CM-90 (PR 2) : sans réseau (ou sans réponse en 8 s), démarrage hors ligne
 * depuis le pack séance, avec le même id.
 *
 * Un seul démarrage à la fois : un double tap pendant la création ou pendant
 * la navigation vers la séance ne crée pas une seconde séance.
 */
export function useStartSession(profileId: string | null) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const busy = useRef(false);

  const showError = useCallback(
    (message: string) => {
      busy.current = false;
      router.push(`/dashboard?error=${encodeURIComponent(message)}`);
    },
    [router],
  );

  const { mutate } = useMutation({
    mutationFn: ({ id, dayId }: { id: string; dayId: string }) => startSession(id, dayId),
    onSuccess: (result, { id }) => {
      if (result.ok) {
        // Une séance est maintenant en cours : l'accueil en cache (sans son
        // bandeau) est RETIRÉ avant de le quitter. Une invalidation le
        // relirait tout de suite, pour rien : on le quitte. La suite (fin,
        // abandon) invalide `[profileId, "sessions"]` (PR 6).
        queryClient.removeQueries({ queryKey: queryKeys.dashboard.all(id) });
        router.push(sessionPath(result.sessionId));
        return;
      }
      // La séance type a pu disparaître : l'accueil est relu.
      void queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.all(id) });
      showError(result.error);
    },
    // `startSession` ne lève pas, mais une exception imprévue ne doit ni
    // bloquer les taps suivants ni passer sans message.
    onError: (e) => {
      const message = e instanceof Error ? e.message : "erreur inconnue";
      showError(`Impossible de démarrer la séance : ${message}`);
    },
  });

  return useCallback(
    (dayId: string) => {
      if (!profileId || busy.current) return;
      busy.current = true;
      mutate({ id: profileId, dayId });
    },
    [profileId, mutate],
  );
}
