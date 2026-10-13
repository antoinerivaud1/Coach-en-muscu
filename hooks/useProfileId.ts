"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { isAuthRetryableFetchError } from "@supabase/supabase-js";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { queryKeys } from "@/lib/data/queryKeys";
import { isUuid, loginPath, resolveProfileId } from "@/lib/auth/core";
import { queueStore } from "@/lib/offline/queueStore";
import { lastKnownProfileId, rememberProfileId } from "@/lib/offline/sessionCache";

/**
 * CM-88 : id du profil connecté, côté navigateur. `getClaims()` valide le
 * JWT, `claims.sub` est l'id du profil, sinon personne. Jamais `getSession()`
 * seul pour décider d'un accès. CM-89 (PR 1) : plus aucune lecture de la
 * session côté serveur pour les écrans, tout passe par ici.
 *
 * La sécurité reste en base (RLS) : ce hook ne sert qu'à savoir quoi afficher
 * et quand renvoyer vers `/login`.
 *
 * Seule une erreur RÉSEAU lève (l'écran propose « Réessayer ») ; un jeton
 * refusé (révoqué, compte supprimé…) vaut « personne », comme côté serveur.
 */
export async function readBrowserProfileId(): Promise<string | null> {
  let result: Awaited<ReturnType<ReturnType<typeof getSupabaseBrowserClient>["auth"]["getClaims"]>>;
  try {
    result = await getSupabaseBrowserClient().auth.getClaims();
  } catch (e) {
    // `TypeError` : `fetch` qui échoue (hors ligne) hors des erreurs typées.
    if (isAuthRetryableFetchError(e) || e instanceof TypeError) return offlineFallback(e);
    throw e;
  }
  const { data, error } = result;
  if (error) {
    if (isAuthRetryableFetchError(error)) return offlineFallback(error);
    return null;
  }
  const sub = data?.claims?.sub;
  const profileId = resolveProfileId(isUuid(sub) ? sub : null);
  if (profileId) rememberProfileId(queueStore(), profileId);
  return profileId;
}

/**
 * CM-90 (PR 2) : hors ligne, la validation du jeton est impossible (clés
 * publiques ou rafraîchissement à télécharger). On garde alors le dernier
 * compte validé sur CE téléphone (effacé à la déconnexion), pour afficher les
 * données locales et démarrer une séance hors ligne. Ce n'est pas une
 * décision d'accès : rien ne part en base sans un jeton valide (RLS), les
 * écritures attendent le réseau. Sans compte connu : l'erreur réseau remonte,
 * l'écran propose « Réessayer », comme avant.
 */
function offlineFallback(error: unknown): string {
  const last = lastKnownProfileId(queueStore());
  if (last && isUuid(last)) return last;
  throw error;
}

/**
 * `enabled` faux : aucune lecture (CM-89 (PR 1) : `OnboardingGate` sur les
 * pages publiques, servies même sans Supabase).
 */
export function useProfileId({ enabled = true }: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: queryKeys.auth(),
    queryFn: readBrowserProfileId,
    enabled,
    // Un compte connu reste valable 1 min. « Personne » est toujours revérifié
    // à l'ouverture d'un écran : la session a pu être posée entre-temps par le
    // serveur (connexion), sans que le navigateur en soit prévenu. Sinon un
    // écran ouvert avant la connexion renverrait à /login en boucle.
    staleTime: (query) => (query.state.data === null ? 0 : 60_000),
  });
}

/**
 * Pour les écrans privés : renvoie l'id du profil une fois connu, et redirige
 * vers `/login?next=<chemin>` si personne n'est connecté (remplace
 * `requireProfileId(next)` des pages serveur, supprimé en CM-88). Une erreur réseau n'est PAS une déconnexion :
 * l'écran affiche son état d'erreur, sans redirection. Pas de redirection non
 * plus sur un « personne » en cache pendant qu'une relecture est en cours,
 * ni quand l'écran le demande (`redirect: false`).
 */
export function useRequireProfileId(next: string, options: { redirect?: boolean } = {}) {
  const router = useRouter();
  const query = useProfileId();
  const signedOut = query.isSuccess && !query.isFetching && query.data === null;
  // CM-88 (PR 6) : `redirect: false` pendant une séance en cours. Jamais de
  // renvoi vers /login en pleine saisie (CM-59 B) : le logger affiche
  // « Session expirée » et sa file attend la reconnexion.
  const shouldRedirect = signedOut && options.redirect !== false;

  useEffect(() => {
    if (shouldRedirect) router.replace(loginPath(next));
  }, [shouldRedirect, router, next]);

  return {
    profileId: query.data ?? null,
    isPending: query.isPending || signedOut,
    error: query.error,
    refetch: query.refetch,
  };
}
