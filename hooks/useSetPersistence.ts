"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { upsertSet, deleteSet } from "@/lib/actions/sessionSets";
import {
  backoffDelay,
  enqueueOp,
  markHeadFailed,
  parseQueueSnapshot,
  pendingIdsOf,
  queueStorageKey,
  serializeQueue,
  shiftQueue,
  type PendingSet,
  type QueuedOp,
} from "@/lib/utils/setQueue";

/** Nombre d'échecs consécutifs à partir duquel on prévient l'utilisateur. */
const FAILURE_NOTICE_THRESHOLD = 3;

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
  enqueueUpsert: (set: PendingSet) => void;
  enqueueDelete: (id: string) => void;
  /** Tente de vider la file, au plus `timeoutMs`. Rend `true` si elle est vide. */
  flush: (timeoutMs: number) => Promise<boolean>;
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
 */
export function useSetPersistence(sessionId: string): SetPersistence {
  const queueRef = useRef<QueuedOp[]>([]);
  const [queue, setQueue] = useState<QueuedOp[]>([]);
  const [failures, setFailures] = useState(0);
  const [restored, setRestored] = useState<QueuedOp[] | null>(null);

  const runningRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const aliveRef = useRef(true);
  /** Réveils demandés pendant qu'une opération était en vol. */
  const wakeUpRef = useRef(false);

  const storageKey = queueStorageKey(sessionId);

  const persist = useCallback(
    (next: readonly QueuedOp[]) => {
      if (typeof window === "undefined") return;
      try {
        if (next.length === 0) window.localStorage.removeItem(storageKey);
        else window.localStorage.setItem(storageKey, serializeQueue(next));
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
          const op = queueRef.current[0]!;
          let ok = false;
          try {
            const result =
              op.kind === "upsert"
                ? await upsertSet(op.set)
                : await deleteSet({ id: op.id, sessionId: op.sessionId });
            ok = result.ok;
          } catch {
            // Hors-ligne, ou server action injoignable : on réessaiera.
            ok = false;
          }
          if (!aliveRef.current) return;

          if (ok) {
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
  }, [clearTimer, commit]);

  // Reprise de la file laissée par une session précédente de la page, puis
  // envoi immédiat. C'est ce qui rattrape une série validée hors réseau avant
  // la fermeture de l'app.
  useEffect(() => {
    aliveRef.current = true;
    let snapshot: string | null = null;
    try {
      snapshot = window.localStorage.getItem(storageKey);
    } catch {
      snapshot = null;
    }
    const pending = parseQueueSnapshot(snapshot);
    if (pending.length > 0) {
      queueRef.current = pending;
      setQueue(pending);
    }
    setRestored(pending);
    void pump();

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
      aliveRef.current = false;
      clearTimer();
      window.removeEventListener("online", wake);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [storageKey, pump, clearTimer]);

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

  const pendingIds = useMemo(() => pendingIdsOf(queue), [queue]);

  return {
    restored,
    pendingIds,
    hasPending: queue.length > 0,
    isStalled: failures >= FAILURE_NOTICE_THRESHOLD,
    enqueueUpsert,
    enqueueDelete,
    flush,
  };
}
