"use client";

import { useQuery } from "@tanstack/react-query";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { queryKeys } from "@/lib/data/queryKeys";
import { fetchDuoState } from "@/lib/data/profile";

/**
 * CM-88 : état du duo (solo, invitation en attente, en duo). Les actions du
 * duo (hooks/data/useDuoActions.ts) effacent ce cache quand elles aboutissent.
 */
export function useDuoState(profileId: string | null) {
  return useQuery({
    queryKey: queryKeys.duo.state(profileId ?? ""),
    queryFn: () => fetchDuoState(getSupabaseBrowserClient(), profileId!),
    enabled: !!profileId,
  });
}
