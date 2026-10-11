"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { queryKeys } from "@/lib/data/queryKeys";
import { fetchBadges } from "@/lib/data/profile";

/**
 * CM-88 : badges du Profil. Dépend de l'objectif hebdo (badge « Semaine
 * parfaite ») : ne démarre qu'une fois l'objectif connu. Quand l'objectif
 * change (section « Mon profil »), les badges précédents restent affichés
 * pendant la relecture : pas de retour au squelette.
 */
export function useBadges(profileId: string | null, weeklyGoal: number | null) {
  return useQuery({
    queryKey: queryKeys.profile.badges(profileId ?? "", weeklyGoal ?? 0),
    queryFn: () => fetchBadges(getSupabaseBrowserClient(), profileId!, weeklyGoal!),
    enabled: !!profileId && weeklyGoal !== null,
    placeholderData: keepPreviousData,
  });
}
