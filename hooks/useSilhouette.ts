"use client";

import { useCallback, useEffect, useState } from "react";
import {
  defaultSilhouette,
  readStoredSilhouette,
  resolveSilhouette,
  storeSilhouette,
  type Silhouette,
} from "@/lib/silhouette";

/** Événement interne : la fiche et la carte compacte restent synchronisées. */
const CHANGE_EVENT = "cm:silhouette-change";

/**
 * Silhouette affichée sur les cartes musculaires (CM-30). Rendu serveur et
 * premier rendu client sur le défaut, puis bascule sur le choix mémorisé
 * après montage (pas d'écart d'hydratation).
 */
export function useSilhouette(): [Silhouette, (value: Silhouette) => void] {
  const [silhouette, setSilhouette] = useState<Silhouette>(() => defaultSilhouette());

  useEffect(() => {
    setSilhouette(resolveSilhouette(readStoredSilhouette()));
    const onChange = (e: Event) => {
      const next = (e as CustomEvent<Silhouette>).detail;
      if (next === "homme" || next === "femme") setSilhouette(next);
    };
    window.addEventListener(CHANGE_EVENT, onChange);
    return () => window.removeEventListener(CHANGE_EVENT, onChange);
  }, []);

  const choose = useCallback((value: Silhouette) => {
    setSilhouette(value);
    storeSilhouette(value);
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: value }));
  }, []);

  return [silhouette, choose];
}
