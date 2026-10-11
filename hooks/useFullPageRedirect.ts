"use client";

import { useEffect } from "react";

/**
 * CM-88 : après un changement de compte (connexion, inscription,
 * déconnexion, suppression), navigation par RECHARGEMENT COMPLET plutôt que
 * par `redirect()` de server action (navigation client) : le cache de données
 * du navigateur (TanStack Query) repart de zéro et ne peut rien montrer du
 * compte précédent. `assign` garde l'entrée dans l'historique, comme un lien.
 */
export function useFullPageRedirect(target: string | undefined) {
  useEffect(() => {
    if (target) window.location.assign(target);
  }, [target]);
}
