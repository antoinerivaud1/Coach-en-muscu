"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { deleteSessionSet, upsertSessionSet } from "@/lib/data/sessionWrites";
import { markSessionListsStale } from "@/hooks/data/useSessionScreen";
import { hasPendingStart } from "@/lib/offline/pendingStarts";
import { claimSessionQueue } from "@/lib/offline/queueOwners";
import { queueStore, whenQueuesReady } from "@/lib/offline/queueStore";
import { recordConfirmed } from "@/lib/offline/sessionCache";
import {
  backoffDelay,
  enqueueOp,
  markHeadFailed,
  parseQueueSnapshot,
  pendingIdsOf,
  queueStorageKey,
  refusedStorageKey,
  serializeQueue,
  shiftQueue,
  type PendingSet,
  type QueuedOp,
} from "@/lib/utils/setQueue";

/** Nombre d'échecs consécutifs à partir duquel on prévient l'utilisateur. */
const FAILURE_NOTICE_THRESHOLD = 3;

/**
 * CM-90 : séance démarrée hors ligne, pas encore créée en base. Ses séries
 * attendent (PendingSync crée la séance d'abord) : nouvel essai à ce rythme,
 * sans compter d'échec ni afficher « en difficulté ».
 */
const WAIT_FOR_START_MS = 2000;

export interface SetPersistence {
  /**
   * File retrouvée dans `localStorage` au montage, `null` tant qu'elle n'a pas
   * été lue. Ces séries n'existent pas encore en base : l'écran de saisie doit
   * les réafficher comme validées, sinon l'utilisateur les saisirait une
   * seconde fois et l'on écrirait deux lignes pour la même série.
   */
  restored: QueuedOp[] | null;
  /** Ids des séries validées dont l'écriture n'est pas encore confirmée. */
  pendingIds: Set<string>;
  /** Vrai tant qu'il reste une opération à écrire. */
  hasPending: boolean;
  /** Vrai après 3 échecs consécutifs sur la même opération. */
  isStalled: boolean;
  /**
   * CM-59 B : séries refusées définitivement par le serveur, mises de côté
   * sous `cm:refusedSets:<id>` (jamais jetées en silence).
   */
  refusedCount: number;
  /** CM-59 B : le serveur a répondu « Session expirée » ; la file attend. */
  sessionExpired: boolean;
  enqueueUpsert: (set: PendingSet) => void;
  enqueueDelete: (id: string) => void;
  /** Tente de vider la file, au plus `timeoutMs`. Rend `true` si elle est vide. */
  flush: (timeoutMs: number) => Promise<boolean>;
  /**
   * Abandonne la file (séance supprimée, CM-94) : plus rien ne sera écrit, la
   * copie `localStorage` est effacée. Attend au plus `timeoutMs` que
   * l'opération déjà partie sur le réseau revienne, pour qu'elle n'arrive pas
   * après la suppression de la séance.
   */
  discard: (timeoutMs: number) => Promise<void>;
}

/**
 * File d'écriture des séries d'une séance (CM-78).
 *
 * Une opération en vol à la fois, dans l'ordre de validation : la série 2 n'est
 * jamais écrite avant la série 1, et une suppression jamais avant l'écriture
 * qu'elle annule. Un échec ne bloque rien — la saisie continue, la file
 * réessaie seule (1 s, 3 s, 10 s, puis toutes les 30 s), sans limite tant que
 * la page est ouverte, et immédiatement au retour du réseau ou de l'app au
 * premier plan.
 *
 * La file est recopiée dans `localStorage` à chaque changement : une série
 * validée dans le métro puis l'app tuée par iOS est écrite à la réouverture de
 * la séance. C'est une donnée de secours, jamais une source de vérité — la clé
 * est supprimée dès que la file est vide.
 *
 * CM-90 (PR 1) : stockage via `queueStore()` (recopié dans Preferences sur
 * iPhone, que iOS ne purge pas), lu après `whenQueuesReady()`. Tant que le
 * hook est monté, il POSSÈDE la file de sa séance (`claimSessionQueue`) :
 * `PendingSync` rejoue toutes les autres, jamais celle-ci.
 */
export function useSetPersistence(sessionId: string): SetPersistence {
  const queryClient = useQueryClient();
  const queueRef = useRef<QueuedOp[]>([]);
  const [queue, setQueue] = useState<QueuedOp[]>([]);
  const [failures, setFailures] = useState(0);
  const [restored, setRestored] = useState<QueuedOp[] | null>(null);
  const [refusedCount, setRefusedCount] = useState(0);
  const [sessionExpired, setSessionExpired] = useState(false);

  const runningRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const aliveRef = useRef(true);
  /** Réveils demandés pendant qu'une opération était en vol. */
  const wakeUpRef = useRef(false);
  /**
   * CM-90 : vrai une fois la file stockée relue (après `whenQueuesReady`).
   * Avant, rien n'est écrit ni envoyé : une validation faite pendant ces
   * quelques millisecondes ne doit ni écraser la file stockée, ni passer
   * devant elle.
   */
  const loadedRef = useRef(false);

  const storageKey = queueStorageKey(sessionId);
  const refusedKey = refusedStorageKey(sessionId);

  /**
   * CM-59 B : met de côté une série refusée définitivement. Une suppression
   * refusée n'est pas gardée : la ligne n'existe plus (ou n'est pas à toi),
   * aucune saisie n'est perdue.
   */
  const setAside = useCallback(
    (op: QueuedOp) => {
      if (op.kind !== "upsert") return;
      try {
        const store = queueStore();
        const kept = parseQueueSnapshot(store.getItem(refusedKey));
        const next = [...kept, { ...op, attempts: 0 }];
        store.setItem(refusedKey, serializeQueue(next));
        setRefusedCount(next.length);
      } catch {
        // Stockage indisponible : on garde au moins le compteur à l'écran.
        setRefusedCount((n) => n + 1);
      }
    },
    [refusedKey],
  );

  const persist = useCallback(
    (next: readonly QueuedOp[]) => {
      if (!loadedRef.current) return;
      try {
        const store = queueStore();
        if (next.length === 0) store.removeItem(storageKey);
        else store.setItem(storageKey, serializeQueue(next));
      } catch {
        // Quota plein ou stockage refusé (navigation privée iOS) : la file
        // reste en mémoire, on ne casse pas la saisie pour autant.
      }
    },
    [storageKey],
  );

  const commit = useCallback(
    (next: QueuedOp[]) => {
      queueRef.current = next;
      persist(next);
      setQueue(next);
    },
    [persist],
  );

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  /**
   * Vide la file, séquentiellement. Une seule boucle tourne à la fois : un
   * appel concurrent se contente de demander un réveil, traité à la sortie.
   */
  const pump = useCallback(async (): Promise<void> => {
    if (!loadedRef.current) return;
    if (runningRef.current) {
      wakeUpRef.current = true;
      return;
    }
    runningRef.current = true;
    clearTimer();
    try {
      do {
        wakeUpRef.current = false;
        while (aliveRef.current && queueRef.current.length > 0) {
          if (hasPendingStart(queueStore(), sessionId)) {
            timerRef.current = setTimeout(() => {
              timerRef.current = null;
              void pump();
            }, WAIT_FOR_START_MS);
            return;
          }
          const op = queueRef.current[0]!;
          let ok = false;
          let refused = false;
          let expired = false;
          try {
            // CM-88 (PR 6) : écriture directe depuis le navigateur, sous RLS.
            const supabase = getSupabaseBrowserClient();
            const result =
              op.kind === "upsert"
                ? await upsertSessionSet(supabase, op.set)
                : await deleteSessionSet(supabase, { id: op.id, sessionId: op.sessionId });
            ok = result.ok;
            refused = !result.ok && result.refused === true;
            expired = !result.ok && result.expired === true;
          } catch {
            // Hors ligne (jeton à rafraîchir sans réseau) : on réessaiera.
            ok = false;
          }
          if (!aliveRef.current) return;
          setSessionExpired(expired);

          if (ok) {
            // CM-90 (PR 2) : la séance rouverte hors ligne affichera cette série.
            recordConfirmed(
              queueStore(),
              sessionId,
              op.kind === "upsert" ? { kind: "upsert", set: op.set } : { kind: "delete", id: op.id },
            );
            commit(shiftQueue(queueRef.current));
            setFailures(0);
            // Remplace `revalidatePath` : Carnet, Stats et accueil seront
            // relus à leur prochaine ouverture.
            void markSessionListsStale(queryClient);
            continue;
          }
          // CM-59 B : refus définitif (séance introuvable ou pas à toi) : mis
          // de côté au lieu d'être rejoué en boucle toutes les 30 s. Tout le
          // reste (42501, session expirée, réseau) est rejoué.
          if (refused) {
            setAside(op);
            commit(shiftQueue(queueRef.current));
            setFailures(0);
            continue;
          }

          const next = markHeadFailed(queueRef.current);
          commit(next);
          const attempts = next[0]?.attempts ?? 1;
          setFailures(attempts);
          timerRef.current = setTimeout(() => {
            timerRef.current = null;
            void pump();
          }, backoffDelay(attempts));
          return;
        }
      } while (wakeUpRef.current && aliveRef.current);
    } finally {
      runningRef.current = false;
    }
  }, [clearTimer, commit, setAside, queryClient, sessionId]);

  // Reprise de la file laissée par une session précédente de la page, puis
  // envoi immédiat. C'est ce qui rattrape une série validée hors réseau avant
  // la fermeture de l'app.
  useEffect(() => {
    aliveRef.current = true;
    loadedRef.current = false;
    // Nouvelle séance (ou premier montage) : rien d'une autre file en mémoire.
    queueRef.current = [];
    // Propre à CE montage : un double montage (mode strict) ne relit pas deux fois.
    let active = true;
    const release = claimSessionQueue(sessionId);

    // CM-90 : sur iPhone, la file a pu être restaurée depuis Preferences ; on
    // attend la fin de cette restauration avant de la lire.
    void whenQueuesReady().then(() => {
      if (!active || !aliveRef.current) return;
      const store = queueStore();
      let snapshot: string | null = null;
      try {
        snapshot = store.getItem(storageKey);
      } catch {
        snapshot = null;
      }
      const pending = parseQueueSnapshot(snapshot);
      try {
        setRefusedCount(parseQueueSnapshot(store.getItem(refusedKey)).length);
      } catch {
        setRefusedCount(0);
      }
      // Une série validée avant la fin de la restauration reste après les
      // séries restaurées : l'ordre de validation est conservé.
      loadedRef.current = true;
      const merged = [...pending, ...queueRef.current];
      if (merged.length > 0) commit(merged);
      setRestored(pending);
      void pump();
    });

    const wake = () => {
      clearTimer();
      void pump();
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") wake();
    };
    window.addEventListener("online", wake);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      active = false;
      aliveRef.current = false;
      release();
      clearTimer();
      window.removeEventListener("online", wake);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [sessionId, storageKey, refusedKey, pump, clearTimer, commit]);

  const push = useCallback(
    (op: QueuedOp) => {
      // La tête de file est peut-être déjà partie sur le réseau : on ne la
      // remplace jamais, sa confirmation retirerait l'opération plus récente.
      const locked = runningRef.current ? 1 : 0;
      commit(enqueueOp(queueRef.current, op, locked));
      void pump();
    },
    [commit, pump],
  );

  const enqueueUpsert = useCallback(
    (set: PendingSet) => push({ kind: "upsert", set, attempts: 0 }),
    [push],
  );

  const enqueueDelete = useCallback(
    (id: string) => push({ kind: "delete", id, sessionId, attempts: 0 }),
    [push, sessionId],
  );

  const flush = useCallback(
    async (timeoutMs: number): Promise<boolean> => {
      if (queueRef.current.length === 0) return true;
      clearTimer();
      void pump();
      const deadline = Date.now() + timeoutMs;
      while (queueRef.current.length > 0 && Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 100));
        // Une file en backoff attend son timer : on la relance tant qu'il
        // reste du temps, l'utilisateur, lui, attend devant son écran.
        if (!runningRef.current && queueRef.current.length > 0) {
          clearTimer();
          void pump();
        }
      }
      return queueRef.current.length === 0;
    },
    [clearTimer, pump],
  );

  const discard = useCallback(
    async (timeoutMs: number): Promise<void> => {
      clearTimer();
      commit([]);
      setFailures(0);
      const deadline = Date.now() + timeoutMs;
      while (runningRef.current && Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    },
    [clearTimer, commit],
  );

  const pendingIds = useMemo(() => pendingIdsOf(queue), [queue]);

  return {
    restored,
    pendingIds,
    hasPending: queue.length > 0,
    isStalled: failures >= FAILURE_NOTICE_THRESHOLD,
    refusedCount,
    sessionExpired,
    enqueueUpsert,
    enqueueDelete,
    flush,
    discard,
  };
}
