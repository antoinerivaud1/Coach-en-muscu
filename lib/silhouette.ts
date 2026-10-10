// Silhouette de la carte musculaire (CM-30) : homme ou femme.
//
// Libellés neutres « Homme » / « Femme » et non « Toi » / « Elle » : les
// libellés et couleurs en dur des membres disparaissent au profit des prénoms
// et couleurs choisis (CM-87). CM-103 : plus aucun lien avec l'ancien
// `color_role` (retiré) ; défaut homme, le choix manuel est mémorisé sur
// l'appareil.

export type Silhouette = "homme" | "femme";

export const SILHOUETTE_STORAGE_KEY = "cm:silhouette";

export const SILHOUETTE_LABELS: Record<Silhouette, string> = {
  homme: "Homme",
  femme: "Femme",
};

/** Silhouette par défaut, tant qu'aucun choix n'est mémorisé. */
export function defaultSilhouette(): Silhouette {
  return "homme";
}

/** Valeur relue du stockage, ou `null` si absente ou invalide. */
export function parseSilhouette(raw: unknown): Silhouette | null {
  return raw === "homme" || raw === "femme" ? raw : null;
}

/** Choix mémorisé s'il existe, sinon le défaut. */
export function resolveSilhouette(stored: unknown): Silhouette {
  return parseSilhouette(stored) ?? defaultSilhouette();
}

export function readStoredSilhouette(): Silhouette | null {
  try {
    return parseSilhouette(window.localStorage.getItem(SILHOUETTE_STORAGE_KEY));
  } catch {
    return null;
  }
}

export function storeSilhouette(value: Silhouette): void {
  try {
    window.localStorage.setItem(SILHOUETTE_STORAGE_KEY, value);
  } catch {
    // Stockage indisponible (navigation privée, quota) : le choix vaut pour
    // l'écran courant seulement.
  }
}
