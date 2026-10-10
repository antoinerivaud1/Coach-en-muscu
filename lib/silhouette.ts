// Silhouette de la carte musculaire (CM-30) : homme ou femme.
//
// Libellés neutres « Homme » / « Femme » et non « Toi » / « Elle » : les
// libellés et couleurs en dur des membres disparaissent au profit des prénoms
// et couleurs choisis (CM-87). Le défaut suit le profil actif quand on le
// connaît (`color_role` 'elle' -> femme), sinon homme. Le choix manuel est
// mémorisé sur l'appareil.

export type Silhouette = "homme" | "femme";

export const SILHOUETTE_STORAGE_KEY = "cm:silhouette";

export const SILHOUETTE_LABELS: Record<Silhouette, string> = {
  homme: "Homme",
  femme: "Femme",
};

/** Silhouette par défaut, déduite du rôle couleur du profil actif. */
export function defaultSilhouette(
  colorRole: "toi" | "elle" | null | undefined,
): Silhouette {
  return colorRole === "elle" ? "femme" : "homme";
}

/** Valeur relue du stockage, ou `null` si absente ou invalide. */
export function parseSilhouette(raw: unknown): Silhouette | null {
  return raw === "homme" || raw === "femme" ? raw : null;
}

/** Choix mémorisé s'il existe, sinon défaut du profil. */
export function resolveSilhouette(
  stored: unknown,
  colorRole: "toi" | "elle" | null | undefined,
): Silhouette {
  return parseSilhouette(stored) ?? defaultSilhouette(colorRole);
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
