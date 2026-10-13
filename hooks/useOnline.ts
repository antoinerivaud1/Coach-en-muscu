"use client";

import { useSyncExternalStore } from "react";

function subscribe(onChange: () => void): () => void {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
}

function snapshot(): boolean {
  return typeof navigator === "undefined" || navigator.onLine !== false;
}

/**
 * CM-90 (PR 3) : faux quand le téléphone se sait hors ligne (mode avion, pas
 * de réseau). Sert à désactiver proprement les actions en ligne seulement.
 * Vrai ne garantit rien (réseau de salle inutilisable) : ces actions gardent
 * leur message d'erreur en cas d'échec.
 */
export function useOnline(): boolean {
  return useSyncExternalStore(subscribe, snapshot, () => true);
}
