"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { queryKeys } from "@/lib/data/queryKeys";
import { createCustomExercise, fetchCatalogExercises } from "@/lib/data/exercises";
import type { MuscleGroup } from "@/lib/utils/seances";
import { readBrowserProfileId, useProfileId } from "@/hooks/useProfileId";

/**
 * CM-88 : catalogue d'exercices visible par le profil (guide, builder, ajout
 * en séance). Convention `hooks/data/*` : un hook par lecture, qui appelle une
 * fonction de `lib/data/*` et ne démarre qu'une fois le profil connu.
 */
export function useCatalogExercises(profileId: string | null) {
  return useQuery({
    queryKey: queryKeys.exercises.catalog(profileId ?? ""),
    queryFn: () => fetchCatalogExercises(getSupabaseBrowserClient(), profileId!),
    enabled: !!profileId,
  });
}

/**
 * CM-88 (PR 5) : création d'un exercice perso dans le navigateur (éditeur de
 * séance type et ajout en séance). Le catalogue en cache est relu ensuite.
 * Profil pas encore connu (formulaire ouvert sur un écran serveur) : il est
 * lu au moment de l'envoi.
 */
export function useCreateExercise() {
  const queryClient = useQueryClient();
  const cachedProfileId = useProfileId().data ?? null;
  return useMutation({
    mutationFn: async (input: { name: string; muscle_group: MuscleGroup }) => {
      const profileId = cachedProfileId ?? (await readBrowserProfileId());
      if (!profileId) {
        return { ok: false as const, error: SESSION_EXPIRED_TEXT, profileId: null };
      }
      const result = await createCustomExercise(getSupabaseBrowserClient(), profileId, input);
      return { ...result, profileId };
    },
    onSuccess: async (result) => {
      if (!result.ok || !result.profileId) return;
      await queryClient.invalidateQueries({ queryKey: queryKeys.exercises.all(result.profileId) });
    },
  });
}

const SESSION_EXPIRED_TEXT = "Ta session a expiré. Reconnecte-toi.";
