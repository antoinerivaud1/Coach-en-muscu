"use client";

import { useQuery, type QueryClient } from "@tanstack/react-query";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { queryKeys } from "@/lib/data/queryKeys";
import { fetchSessionScreen } from "@/lib/data/sessionDetail";

/**
 * CM-88 (PR 6) : lecture de l'écran de séance (saisie ou récap).
 *
 * - `staleTime: 0` et `gcTime: 0` : chaque ouverture relit la base, jamais un
 *   cache d'une visite précédente. Le logger s'initialise UNE fois depuis ces
 *   données (voir `SessionScreen`) : elles doivent être fraîches, sinon des
 *   séries déjà écrites seraient proposées à la saisie.
 * - Pas de relecture au retour au premier plan : en pleine séance, l'écran
 *   ne doit pas recharger catalogue et historique à chaque déverrouillage du
 *   téléphone (le logger ne les relirait de toute façon pas).
 */
export function useSessionScreen(profileId: string | null, sessionId: string, edit: boolean) {
  return useQuery({
    queryKey: queryKeys.sessions.detail(profileId ?? "", sessionId, edit),
    queryFn: () => fetchSessionScreen(getSupabaseBrowserClient(), profileId!, sessionId, edit),
    enabled: !!profileId,
    staleTime: 0,
    gcTime: 0,
    refetchOnWindowFocus: false,
  });
}

/**
 * Après une écriture de séance (fin, suppression, séries) : tout ce qui lit
 * les séances (accueil, Carnet, Stats, séances types, écran de séance) est
 * relu. Les écrans affichés le sont tout de suite, les autres à leur
 * prochaine ouverture.
 */
export function invalidateSessions(queryClient: QueryClient, profileId: string): Promise<void> {
  dropHiddenDashboard(queryClient, profileId);
  return queryClient.invalidateQueries({ queryKey: queryKeys.sessions.all(profileId) });
}

/**
 * L'accueil quand il n'est PAS affiché : retiré du cache plutôt qu'invalidé.
 * Une donnée invalidée s'afficherait encore le temps de sa relecture, au
 * retour sur l'accueil : un « Reprendre » vers une séance qu'on vient de
 * terminer ou de supprimer, même une demi-seconde, est faux. Retiré, l'accueil
 * repart d'un squelette puis de données fraîches. Affiché (bandeau de
 * l'accueil), il est simplement relu.
 */
function dropHiddenDashboard(queryClient: QueryClient, profileId: string): void {
  queryClient.removeQueries({ queryKey: queryKeys.dashboard.all(profileId), type: "inactive" });
}

/**
 * Après la SUPPRESSION d'une séance : même relecture, sauf l'écran de cette
 * séance, qu'on quitte. Le relire afficherait « Séance introuvable » le
 * temps de la navigation.
 */
export function invalidateSessionsAfterDelete(
  queryClient: QueryClient,
  profileId: string,
  sessionId: string,
): Promise<void> {
  // Pas de `removeQueries` : l'écran est encore monté, il relancerait la
  // lecture. Avec `gcTime: 0`, son cache part dès qu'on l'a quitté.
  const detail = queryKeys.sessions.detailAll(profileId, sessionId);
  dropHiddenDashboard(queryClient, profileId);
  return queryClient.invalidateQueries({
    queryKey: queryKeys.sessions.all(profileId),
    predicate: (q) => !detail.every((part, i) => q.queryKey[i] === part),
  });
}

/**
 * Séries écrites par la file pendant la saisie : les listes (accueil,
 * Carnet, Stats…) deviennent périmées, mais pas l'écran de séance lui-même,
 * que relire en pleine saisie ne servirait à rien. Quel que soit le profil :
 * la file ne le connaît pas, et le cache d'un autre compte n'existe pas
 * (vidé au changement de compte).
 */
export function markSessionListsStale(queryClient: QueryClient): Promise<void> {
  return queryClient.invalidateQueries({
    predicate: (q) => q.queryKey[1] === "sessions" && q.queryKey[2] !== "detail",
    refetchType: "none",
  });
}
