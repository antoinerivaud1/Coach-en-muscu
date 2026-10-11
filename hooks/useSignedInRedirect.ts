"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useProfileId } from "@/hooks/useProfileId";

/**
 * CM-88 (PR 7) : écrans d'avant compte (connexion, bienvenue, inscription).
 * Un compte déjà connecté part vers `target` (même règle qu'avant côté
 * serveur : `redirect(next)`), sans voir le formulaire.
 *
 * `checking` : vrai tant que la session n'est pas connue (première lecture,
 * ou « personne » en cache en cours de relecture : la session a pu être
 * posée entre-temps, par exemple réécrite lisible par le middleware sur
 * `/login`, voir lib/supabase/auth-config.ts), et pendant le départ. L'écran
 * affiche alors un squelette plutôt qu'un formulaire qui clignote.
 *
 * Une erreur réseau n'empêche pas de se connecter : formulaire affiché.
 * `enabled` faux (connexion en cours dans le formulaire) : aucune redirection
 * d'ici, l'écran part lui-même par rechargement complet.
 */
export function useSignedInRedirect(target: string, enabled = true): { checking: boolean } {
  const router = useRouter();
  const query = useProfileId();
  const signedIn = enabled && !!query.data;

  useEffect(() => {
    if (signedIn) router.replace(target);
  }, [signedIn, target, router]);

  const unknown = query.isPending || (query.data === null && query.isFetching);
  return { checking: enabled && (unknown || signedIn) };
}
