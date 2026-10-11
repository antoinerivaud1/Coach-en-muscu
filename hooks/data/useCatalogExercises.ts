"use client";

import { useQuery } from "@tanstack/react-query";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { queryKeys } from "@/lib/data/queryKeys";
import { fetchCatalogExercises } from "@/lib/data/exercises";

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
    // Tant que la création d'exercice perso reste une server action (PR 5),
    // elle ne peut pas invalider ce cache : relecture à chaque ouverture, le
    // catalogue en cache s'affiche pendant ce temps.
    staleTime: 0,
  });
}
