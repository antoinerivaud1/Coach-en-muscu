"use client";

import { useQuery } from "@tanstack/react-query";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { queryKeys } from "@/lib/data/queryKeys";
import { fetchDuoState } from "@/lib/data/profile";
import type { DuoState } from "@/lib/queries/duoState";
import { throwIfKnownOffline } from "@/lib/offline/readCache";

/**
 * CM-88 : état du duo (solo, invitation en attente, en duo). Les actions du
 * duo (hooks/data/useDuoActions.ts) effacent ce cache quand elles aboutissent.
 */
export function useDuoState(profileId: string | null) {
  return useQuery({
    queryKey: queryKeys.duo.state(profileId ?? ""),
    // CM-90 (PR 3) : une lecture en échec donne `{ kind: "error" }` sans
    // lever. Hors ligne, ou si un état lisible est déjà connu, on lève :
    // l'état gardé sur le téléphone reste affiché (bandeau « Hors ligne »).
    queryFn: async ({ client, queryKey }) => {
      throwIfKnownOffline();
      const state = await fetchDuoState(getSupabaseBrowserClient(), profileId!);
      const known = client.getQueryData<DuoState>(queryKey);
      if (state.kind === "error" && known && known.kind !== "error") {
        throw new Error("Lecture du duo impossible");
      }
      return state;
    },
    enabled: !!profileId,
  });
}
