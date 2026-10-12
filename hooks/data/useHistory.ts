"use client";

import { useQuery } from "@tanstack/react-query";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { queryKeys } from "@/lib/data/queryKeys";
import { fetchHistory } from "@/lib/data/sessions";

/** CM-88 : séances terminées du Carnet (moi, plus mon partenaire en duo actif). */
export function useHistory(profileId: string | null) {
  return useQuery({
    queryKey: queryKeys.sessions.history(profileId ?? ""),
    queryFn: () => fetchHistory(getSupabaseBrowserClient(), profileId!),
    enabled: !!profileId,
    // CM-88 (PR 6) : fin de séance, suppression et correction d'une série
    // invalident `queryKeys.sessions.all` : réglage par défaut (30 s).
  });
}
