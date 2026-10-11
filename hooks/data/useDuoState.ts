"use client";

import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { queryKeys } from "@/lib/data/queryKeys";
import { fetchDuoState } from "@/lib/data/profile";

/**
 * CM-88 : état du duo (solo, invitation en attente, en duo). Les actions du
 * duo restent des server actions (PR 7) : elles rafraîchissent ce cache via
 * `useRefreshAfterDuoAction`, où qu'elles soient déclenchées.
 */
export function useDuoState(profileId: string | null) {
  return useQuery({
    queryKey: queryKeys.duo.state(profileId ?? ""),
    queryFn: () => fetchDuoState(getSupabaseBrowserClient(), profileId!),
    enabled: !!profileId,
  });
}

/**
 * CM-88 : à appeler quand une action du duo a abouti (inviter, annuler,
 * rejoindre, quitter), y compris depuis une page serveur (`/duo/inviter`).
 * L'état du duo en cache est effacé (le Profil ne montre jamais l'ancien
 * état, il le relit à sa prochaine ouverture) et toutes les autres données
 * sont marquées à relire : le duo change la bibliothèque, le catalogue et les
 * comparaisons.
 */
export function useRefreshAfterDuoAction() {
  const queryClient = useQueryClient();
  return useCallback(() => {
    void queryClient.resetQueries({
      predicate: (q) => q.queryKey[1] === "duo" && q.queryKey[2] === "state",
    });
    void queryClient.invalidateQueries({ predicate: (q) => q.queryKey[0] !== "auth" });
  }, [queryClient]);
}

/**
 * CM-88 : enveloppe une server action du duo. Quand elle réussit, elle se
 * termine par `redirect()` : sa promesse est alors rejetée avec l'erreur de
 * redirection, que Next traite. Le cache du navigateur est rafraîchi à ce
 * moment-là (`useRefreshAfterDuoAction`), puis l'erreur est relancée telle
 * quelle. Une erreur renvoyée (`{ error }`) ne touche à rien : le message
 * reste affiché.
 */
export function useDuoAction<A extends unknown[], R>(
  action: (...args: A) => Promise<R>,
): (...args: A) => Promise<R> {
  const refresh = useRefreshAfterDuoAction();
  return async (...args: A) => {
    try {
      return await action(...args);
    } catch (e) {
      refresh();
      throw e;
    }
  };
}
