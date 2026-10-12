"use client";

import { useQuery } from "@tanstack/react-query";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { queryKeys } from "@/lib/data/queryKeys";
import { fetchProgress } from "@/lib/data/progress";

/**
 * CM-88 : écran Stats. `requestedProfileId` est le `?profile=` de l'URL, non
 * vérifié : la lecture ne le retient que s'il est membre de mon duo actif.
 */
export function useProgress(profileId: string | null, requestedProfileId: string | null) {
  return useQuery({
    queryKey: queryKeys.sessions.progress(profileId ?? "", requestedProfileId ?? ""),
    queryFn: () =>
      fetchProgress(getSupabaseBrowserClient(), profileId!, requestedProfileId),
    enabled: !!profileId,
    // CM-88 (PR 6) : comme `useHistory`, invalidé par les écritures de
    // séance : réglage par défaut (30 s).
  });
}
