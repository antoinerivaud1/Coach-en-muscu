"use client";

import { useCallback, useEffect, useState } from "react";

export type RestTimerState = "idle" | "running" | "finished";

export interface UseRestTimer {
  state: RestTimerState;
  remainingSeconds: number;
  totalSeconds: number;
  start: (durationSeconds: number) => void;
  stop: () => void;
  addSeconds: (delta: number) => void;
}

/**
 * Fréquence de rafraîchissement. On tick plus vite que la seconde pour que
 * l'affichage change au bon moment, mais le restant est TOUJOURS recalculé
 * depuis l'échéance absolue : aucun tick n'est accumulé, donc aucune dérive
 * si l'app passe en arrière-plan ou si l'écran s'éteint (CM-73).
 */
const TICK_MS = 250;

function remainingFrom(endsAt: number): number {
  return Math.max(0, Math.ceil((endsAt - Date.now()) / 1000));
}

/**
 * Décompte du repos entre deux séries. Source unique de vérité : une seule
 * instance doit être montée par séance, puis partagée par les deux rendus
 * (grand + barre compacte). Deux instances = deux décomptes désynchronisés.
 */
export function useRestTimer(): UseRestTimer {
  const [endsAt, setEndsAt] = useState<number | null>(null);
  const [totalSeconds, setTotalSeconds] = useState(0);
  const [remainingSeconds, setRemainingSeconds] = useState(0);

  useEffect(() => {
    if (endsAt === null) return;

    let intervalId: ReturnType<typeof setInterval> | null = null;

    const sync = () => {
      const left = remainingFrom(endsAt);
      setRemainingSeconds(left);
      // Plus rien à décompter : on libère l'interval sans attendre le unmount.
      if (left <= 0 && intervalId !== null) {
        clearInterval(intervalId);
        intervalId = null;
      }
    };

    sync();
    if (remainingFrom(endsAt) > 0) {
      intervalId = setInterval(sync, TICK_MS);
    }
    // Retour au premier plan : recalcul immédiat, sans attendre le tick suivant.
    document.addEventListener("visibilitychange", sync);

    return () => {
      if (intervalId !== null) clearInterval(intervalId);
      document.removeEventListener("visibilitychange", sync);
    };
  }, [endsAt]);

  const start = useCallback((durationSeconds: number) => {
    const d = Math.max(0, Math.round(durationSeconds));
    // Les trois états sont posés dans le même batch : `state` ne passe jamais
    // par un "finished" fantôme entre le montage et le premier tick.
    setTotalSeconds(d);
    setRemainingSeconds(d);
    setEndsAt(Date.now() + d * 1000);
  }, []);

  const stop = useCallback(() => {
    setEndsAt(null);
    setRemainingSeconds(0);
    setTotalSeconds(0);
  }, []);

  const addSeconds = useCallback((delta: number) => {
    setEndsAt((prev) => {
      if (prev === null) return prev;
      // Un retrait ne peut pas repousser l'échéance dans le passé : au pire
      // le repos se termine maintenant.
      return Math.max(Date.now(), prev + delta * 1000);
    });
    setTotalSeconds((t) => Math.max(0, t + delta));
  }, []);

  const state: RestTimerState =
    endsAt === null ? "idle" : remainingSeconds > 0 ? "running" : "finished";

  return { state, remainingSeconds, totalSeconds, start, stop, addSeconds };
}
