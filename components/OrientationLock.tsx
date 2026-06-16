"use client";

import { useEffect } from "react";

/**
 * Force l'affichage en portrait sur les plateformes qui supportent la
 * Screen Orientation API (Android Chrome en PWA installée). Sur iOS le
 * verrouillage est assuré par le champ `orientation` du manifest. Silencieux
 * partout où l'API n'existe pas ou refuse le verrou (ex. Safari desktop).
 */
export default function OrientationLock() {
  useEffect(() => {
    const orientation = screen.orientation as
      | (ScreenOrientation & { lock?: (o: string) => Promise<void> })
      | undefined;
    orientation?.lock?.("portrait").catch(() => {});
  }, []);
  return null;
}
