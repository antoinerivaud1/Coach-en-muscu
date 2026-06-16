import { useEffect, useRef } from "react";

/**
 * Maintient l'écran allumé tant que `active` est vrai (Screen Wake Lock API).
 * Silencieux si l'API est absente (vieux iOS) ou si la demande est refusée.
 * Le verrou est relâché au démontage, quand `active` repasse à faux, et
 * ré-acquis automatiquement quand l'onglet redevient visible (le navigateur
 * relâche le wake lock dès que la page passe en arrière-plan).
 */
export function useWakeLock(active: boolean): void {
  const lockRef = useRef<WakeLockSentinel | null>(null);

  useEffect(() => {
    if (!active) return;
    const wakeLock = navigator.wakeLock;
    if (!wakeLock) return;

    let cancelled = false;

    const request = async () => {
      try {
        const lock = await wakeLock.request("screen");
        if (cancelled) {
          void lock.release().catch(() => {});
          return;
        }
        lockRef.current = lock;
      } catch {
        // Refusé / non supporté : on n'affiche rien.
      }
    };

    const handleVisibility = () => {
      if (document.visibilityState === "visible" && !cancelled) {
        void request();
      }
    };

    void request();
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", handleVisibility);
      void lockRef.current?.release().catch(() => {});
      lockRef.current = null;
    };
  }, [active]);
}
