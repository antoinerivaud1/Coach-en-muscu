"use client";

import { useEffect, useState } from "react";
import { finishSession } from "@/app/sessions/[id]/actions";
import { upsertSet, deleteSet } from "@/lib/actions/sessionSets";
import { getPending, setPending } from "@/lib/pendingSessions";
import {
  parseQueueSnapshot,
  serializeQueue,
  sessionIdFromQueueKey,
  shiftQueue,
  type QueuedOp,
} from "@/lib/utils/setQueue";

/** Séance actuellement ouverte, qui gère sa file elle-même. */
function openSessionId(): string | null {
  return window.location.pathname.match(/^\/sessions\/([^/?#]+)/)?.[1] ?? null;
}

/**
 * Rattrapage des files de séries laissées par une séance fermée (CM-78).
 *
 * En temps normal `useSetPersistence` vide sa file dans la séance elle-même.
 * Reste le cas où l'utilisateur a terminé sa séance alors qu'il restait des
 * écritures en attente : la séance passe en récap, le logger ne se monte plus,
 * et personne ne rejouerait ces séries. Elles sont écrites ici, à la première
 * ouverture de l'app avec du réseau.
 *
 * La séance ouverte est volontairement ignorée : deux drainages concurrents sur
 * la même file ne garantiraient plus l'ordre des opérations.
 */
async function syncSets(): Promise<void> {
  const skip = openSessionId();
  let keys: string[];
  try {
    keys = Object.keys(window.localStorage);
  } catch {
    return;
  }

  for (const key of keys) {
    const sessionId = sessionIdFromQueueKey(key);
    if (!sessionId || sessionId === skip) continue;

    let ops: QueuedOp[];
    try {
      ops = parseQueueSnapshot(window.localStorage.getItem(key));
    } catch {
      continue;
    }

    while (ops.length > 0) {
      const op = ops[0]!;
      try {
        const result =
          op.kind === "upsert"
            ? await upsertSet(op.set)
            : await deleteSet({ id: op.id, sessionId: op.sessionId });
        if (!result.ok) break;
      } catch {
        break; // Hors-ligne : on réessaiera au prochain `online`.
      }
      ops = shiftQueue(ops);
    }

    try {
      if (ops.length === 0) window.localStorage.removeItem(key);
      else window.localStorage.setItem(key, serializeQueue(ops));
    } catch {
      // Stockage indisponible : rien à faire, la file reste ce qu'elle est.
    }
  }
}

export default function PendingSync() {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function sync() {
      if (typeof navigator !== "undefined" && navigator.onLine === false) {
        setCount(getPending().length);
        return;
      }

      await syncSets();
      if (cancelled) return;

      const items = getPending();
      if (items.length === 0) {
        setCount(0);
        return;
      }
      const remaining = [];
      for (const it of items) {
        try {
          const r = await finishSession(it);
          if (!r.ok) remaining.push(it);
        } catch {
          remaining.push(it);
        }
      }
      if (cancelled) return;
      setPending(remaining);
      setCount(remaining.length);
    }

    void sync();
    const onOnline = () => void sync();
    window.addEventListener("online", onOnline);
    return () => {
      cancelled = true;
      window.removeEventListener("online", onOnline);
    };
  }, []);

  if (count === 0) return null;
  return (
    <div className="fixed left-1/2 top-2 z-50 -translate-x-1/2 rounded-full bg-amber-500/90 px-3 py-1 text-xs font-medium text-amber-950">
      {count} séance{count > 1 ? "s" : ""} à synchroniser…
    </div>
  );
}
