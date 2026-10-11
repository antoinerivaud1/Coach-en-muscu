"use client";

import { useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { queryKeys } from "@/lib/data/queryKeys";
import { startSessionFromDay } from "@/lib/data/sessionStart";

/**
 * CM-88 (PR 4) : « Démarrer une séance » depuis l'accueil (grille, suggestion,
 * accueil du premier jour). Remplace la server action `startSession` sur ces
 * écrans : succès → `/sessions/<id>` ; échec → `/dashboard?error=…`, le
 * message s'affiche en haut de l'accueil (même parcours que `redirectWithError`,
 * CM-70).
 *
 * Un seul démarrage à la fois : un double tap pendant la création ou pendant
 * la navigation vers la séance ne crée pas une seconde séance.
 */
export function useStartSession(profileId: string | null) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const busy = useRef(false);

  const showError = useCallback(
    (message: string) => {
      busy.current = false;
      router.push(`/dashboard?error=${encodeURIComponent(message)}`);
    },
    [router],
  );

  const { mutate } = useMutation({
    mutationFn: ({ id, dayId }: { id: string; dayId: string }) =>
      startSessionFromDay(getSupabaseBrowserClient(), id, dayId),
    onSuccess: (result, { id }) => {
      if (result.ok) {
        // Une séance est maintenant en cours, et la suite (fin, abandon) passe
        // encore par des server actions qui ne peuvent pas toucher ce cache :
        // on le RETIRE avant de quitter l'accueil, pour qu'au retour rien de
        // périmé ne s'affiche (bandeau d'une séance déjà terminée, premier
        // jour…). Une invalidation le relirait tout de suite, avant la fin de
        // la séance, ce qui ne servirait à rien.
        queryClient.removeQueries({ queryKey: queryKeys.dashboard.all(id) });
        router.push(`/sessions/${result.sessionId}`);
        return;
      }
      // La séance type a pu disparaître : l'accueil est relu.
      void queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.all(id) });
      showError(result.error);
    },
    // `startSessionFromDay` ne lève pas, mais une exception imprévue ne doit
    // ni bloquer les taps suivants ni passer sans message.
    onError: (e) => {
      const message = e instanceof Error ? e.message : "erreur inconnue";
      showError(`Impossible de démarrer la séance : ${message}`);
    },
  });

  return useCallback(
    (dayId: string) => {
      if (!profileId || busy.current) return;
      busy.current = true;
      mutate({ id: profileId, dayId });
    },
    [profileId, mutate],
  );
}
