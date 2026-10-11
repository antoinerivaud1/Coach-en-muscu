"use client";

import { useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { queryKeys } from "@/lib/data/queryKeys";
import { startSessionFromDay } from "@/lib/data/sessions";

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

  const { mutate } = useMutation({
    mutationFn: ({ id, dayId }: { id: string; dayId: string }) =>
      startSessionFromDay(getSupabaseBrowserClient(), id, dayId),
    onSuccess: (result, { id }) => {
      // Une séance est maintenant en cours (ou la séance type a disparu) :
      // l'accueil doit être relu au retour.
      void queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.all(id) });
      if (result.ok) {
        router.push(`/sessions/${result.sessionId}`);
        return;
      }
      busy.current = false;
      router.push(`/dashboard?error=${encodeURIComponent(result.error)}`);
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
